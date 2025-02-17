/*!
 * Originally developed for the r/hurricane subreddit, this Devvit app allows mods to automate updates to various
 * parts of a subreddit, such as a text or image sidebar widget.
 *
 * Author: Tyler Hadidon (Beach-Brews)
 * License: BSD-3-Clause
 */

/* ========== Imports ========== */

import {Devvit, TextAreaWidget, SettingScope, ImageWidget, MediaAsset, Context} from '@devvit/public-api';
import {updateWidget, UpdateWidgetData} from "./extendedDevvit.js";

/* ========== Type Definitions and Constants ========== */

enum SettingKeys {
    SummaryWidgetName = 'summary-widget-name',
    SummaryWidgetDomain = 'summary-widget-domain',
    SummaryUpdateFrequency = 'summary-update-freq'
}

enum ScheduledJobKeys {
    SummaryUpdateJob = 'summary-update'
}

enum RedisKeys {
    SummaryLastModified = 'summary:widget:last_modified',
    SummaryUpdateJob = 'summary:job:id'
}

/* ========== Configure Devvit Fewtures ========== */

Devvit.configure({
    http: true,
    media: true,
    redditAPI: true,
    redis: true
});

/* ========== Define App Configuration Settings ========== */

Devvit.addSettings([
    {
        type: 'string',
        name: SettingKeys.SummaryWidgetName,
        label: 'The name of the summary widget',
        defaultValue: 'Tropical Summary',
        scope: SettingScope.Installation,
        onValidate: event => {
            if (!event.value)
                return 'Must provide a widget name';
        }
    },
    {
        type: 'select',
        name: SettingKeys.SummaryWidgetDomain,
        label: 'The domain to use for the summary widget',
        options: [{
            label: 'Production',
            value: 'rhurricane.net'
        },
        {
            label: 'Development',
            value: 'dev.rhurricane.net'
        }],
        multiSelect: false,
        scope: SettingScope.Installation
    },
    {
        type: 'number',
        name: SettingKeys.SummaryUpdateFrequency,
        label: 'Update frequency (min)',
        defaultValue: 1,
        scope: SettingScope.Installation,
        onValidate: event => {
            if (event.value! < 1)
                return 'Frequency must be at least 1';
            if (event.value! > 60)
                return 'Frequency less than 60';
        }
    }
]);

/* ========== On Update Trigger ========== */
Devvit.addTrigger({
    event: 'AppUpgrade',
    onEvent: async (_, context) => {
        try {
            // ---------- Reschedule Job ---------- */

            // Check if job was scheduled
            const isScheduled = await context.redis.get(RedisKeys.SummaryUpdateJob);
            if (!isScheduled) {
                console.log('[Summary Update Trigger] Job was not scheduled. Must restart using menu item.');
                return;
            }

            // Check the job list too
            const jobs= await context.scheduler.listJobs();
            const scheduledJob = jobs
                .find(j => j.name === ScheduledJobKeys.SummaryUpdateJob);
            if (scheduledJob) {
                console.log('[Summary Update Trigger] Found job is scheduled. No need to reschedule.');
                return;
            }

            // Next, get frequency setting
            const freq = await context.settings.get<number>(SettingKeys.SummaryUpdateFrequency) ?? 1;

            // Build cron expression
            const exp = freq === 1
                ? '* * * * *'
                : freq === 60
                    ?  '0 * * * *'
                    : `*/${freq} * * * *`;

            // Schedule the job
            const jobId = await context.scheduler.runJob({
                cron: exp,
                name: ScheduledJobKeys.SummaryUpdateJob,
                data: {}
            });

            // Store the job ID to redis
            await context.redis.set(RedisKeys.SummaryUpdateJob, jobId);

            console.log('[Summary Update Trigger] Successfully restarted summary update job.')

        } catch (ex) {
            console.log('[Summary Update Trigger] Error while processing update trigger: ', ex);
        }
    }
});

/* ========== Start Job Menu Item ========== */

Devvit.addMenuItem({
    label: 'Summary Widget - Start',
    location: 'subreddit',
    onPress: async (_, context) => {
        let errCtx = 1;
        try {
            // First, check if a job is already scheduled
            const jobs= await context.scheduler.listJobs();
            errCtx = 2;
            const scheduledJob = jobs
                .find(j => j.name === ScheduledJobKeys.SummaryUpdateJob);
            if (scheduledJob) {
                context.ui.showToast({
                    text: 'Summary Widget updates are already running.',
                    appearance: 'neutral'
                });
                console.log('[Summary Update - Start] Summary Widget update job already scheduled.');
                return;
            }

            // Next, get frequency setting
            errCtx = 3;
            const freq = await context.settings.get<number>(SettingKeys.SummaryUpdateFrequency) ?? 1;

            // Build cron expression
            errCtx = 4;
            const exp = freq === 1
                ? '* * * * *'
                : freq === 60
                    ?  '0 * * * *'
                    : `*/${freq} * * * *`;

            // Schedule the job
            errCtx = 5;
            const jobId = await context.scheduler.runJob({
                cron: exp,
                name: ScheduledJobKeys.SummaryUpdateJob,
                data: {}
            });

            // Store the job ID to redis
            await context.redis.set(RedisKeys.SummaryUpdateJob, jobId);

            // Show toaster message
            context.ui.showToast({
                text: `Summary Widget updates scheduled! ID: ${jobId}`,
                appearance: 'success'
            });
            console.log('[Summary Update - Start] Successfully scheduled Summary Widget update job!');

        } catch (ex) {
            console.log('[Summary Update - Start] Error while trying to schedule summary update job: ', ex);
            context.ui.showToast({
                text: `There was an error (${errCtx}) while scheduling the Summary Widget update job.`,
                appearance: 'neutral'
            });
        }
    }
});

/* ========== Stop Jb Menu Item ========== */

Devvit.addMenuItem({
    label: 'Summary Widget - Stop',
    location: 'subreddit',
    onPress: async (_, context) => {
        let errCtx = 1;
        try {
            // First, check if a job is scheduled
            const jobs= await context.scheduler.listJobs();
            errCtx = 2;
            const scheduledJob = jobs
                .find(j => j.name === ScheduledJobKeys.SummaryUpdateJob);
            if (!scheduledJob) {
                context.ui.showToast({
                    text: 'Summary Widget updates are not currently scheduled.',
                    appearance: 'neutral'
                });
                console.log('[Summary Widget - Stop] Summary update job already stopped.');
                return;
            }

            // Simply unschedule the job
            errCtx = 3;
            await context.scheduler.cancelJob(scheduledJob.id);

            // Remove from Redis
            errCtx = 4;
            await context.redis.del(RedisKeys.SummaryUpdateJob);

            // Show toaster message
            context.ui.showToast({
                text: `Summary Widget updates stopped!`,
                appearance: 'success'
            });
            console.log('[Summary Widget - Stop] Successfully stopped Summary Update Job.');

        } catch (ex) {
            console.log('[Summary Widget - Stop] Error while trying to stop summary update job: ', ex);
            context.ui.showToast({
                text: `There was an error (${errCtx}) while stopping the Summary Widget update job.`,
                appearance: 'neutral'
            });
        }
    }
});

/* ========== Widget Refresh Job ========== */

Devvit.addSchedulerJob({
    name: ScheduledJobKeys.SummaryUpdateJob,
    onRun: async (_, context) => {
        try {
            /* ---------- Parameter Validation ---------- */
            
            // Logger helper
            const logger = (msg: string) => { console.log(`${new Date().toISOString()} [Summary Update Job] ${msg}`); };

            // Check context
            if (!context.subredditName)
                return logger('ERROR - Subreddit name from context was missing!');

            // Get widget name
            const widgetName = (await context.settings.get<string>(SettingKeys.SummaryWidgetName))?.toLowerCase();
            if (!widgetName)
                return logger('ERROR - Widget Name setting is missing.');

            // Get fetch domain
            const widgetDomain = await context.settings.get<string>(SettingKeys.SummaryWidgetDomain);
            if (!widgetDomain)
                return logger('ERROR - Widget Domain setting is missing.');

            /* ---------- Call API ---------- */

            // Get the last modified date
            const lastModified = await context.redis.get(RedisKeys.SummaryLastModified);

            // Fetch from the API
            // PERF: For images, it doesn't make sense to receive the full image here, because it has to be uploaded via the media API
            const fetchUrl = `https://${widgetDomain}/api/v1`;
            const apiResult = await fetch(fetchUrl, {
                headers: lastModified ? {
                    'If-Modified-Since': lastModified
                } : undefined
            });

            /* ---------- API Response Validation ---------- */

            // If response was 304, skip!
            if (apiResult.status === 304)
                return logger('INFO - Received HTTP 304 from update endpoint. Content unchanged.')

            // If not a 200 status
            if (apiResult.status !== 200)
                return logger(`ERROR - Received http ${apiResult.status} ${apiResult.statusText} response`);

            // Validate content-type
            const resultContentType = apiResult.headers.get('Content-Type')?.toLowerCase();
            if (!resultContentType || (!resultContentType.startsWith('text/plain') && !resultContentType.startsWith('image/')))
                return logger(`ERROR - Received invalid content type "${resultContentType}" from update endpoint. Expected either "text/plain" or "image/*".`);

            // Helper variable for whether the API content is an image or not
            const contentIsImage = resultContentType.startsWith('image/');
            logger(`INFO - Summary Widget API ${contentIsImage ? 'image' : 'text'} content has changed. Updating the widget contents.`);

            /* ---------- Fetch Existing Widgets ---------- */

            // Fetch list of existing sub widgets, and attempt to find an existing widget with the name
            const subWidgets = await context.reddit.getWidgets(context.subredditName);
            const nameMatchWidgets = subWidgets.filter(w => w.name.toLowerCase() === widgetName);

            // Confirm there is only one...
            if (nameMatchWidgets && nameMatchWidgets.length > 1)
                return logger(`ERROR - Found more than one widget with name ${widgetName}. Unsure which one to update.`);

            // Validate the type of the existing widget
            let existingWidget = nameMatchWidgets.length > 0 ? nameMatchWidgets[0] : undefined;
            if (existingWidget && !(existingWidget instanceof TextAreaWidget) && !(existingWidget instanceof ImageWidget))
                return logger('ERROR - Existing widget is not an image or text widget. Unsure what to do: ' + JSON.stringify(existingWidget.toJSON()));

            // Helper variable for existing widget type
            const existingIsImage = existingWidget ? existingWidget instanceof ImageWidget : undefined;

            /* ---------- Check Existing Widget Type ---------- */

            // If there is an existing widget, but differs from the returned content-type, delete the existing widget
            if (existingWidget && existingIsImage != contentIsImage) {
                logger(`WARN - Detected API content (${contentIsImage ? 'image' : 'text'}) differs from existing widget (${existingIsImage ? 'image' : 'text'}). Deleting the existing widget and replacing it.`);
                await context.reddit.deleteWidget(context.subredditName, existingWidget.id);
                existingWidget = undefined;
            }

            /* ---------- Image Upload ---------- */

            // If an image, upload image to reddit first
            let mediaAsset: MediaAsset | undefined = undefined;
            if (contentIsImage) {
                mediaAsset = await context.media.upload({
                    url: fetchUrl,
                    type: 'image'
                });

                if (!mediaAsset)
                    return logger('ERROR - Failed to upload media image to reddit. Cannot update or add widget.');
            }

            /* ---------- Widget Add or Update ---------- */

            // Set up the core widget data object
            let widgetData = {
                type: contentIsImage ? 'image' : 'textarea',
                id: existingWidget?.id,
                subreddit: context.subredditName,
                shortName: widgetName,
                text: contentIsImage ? undefined : await apiResult.text(),
                data: mediaAsset
                    ? {
                        url: mediaAsset.mediaUrl,
                        linkUrl: '',
                        width: 0,
                        height: 0
                    }
                    : undefined,
                styles: {
                    backgroundColor: '',
                    headerColor: ''
                }
            } as UpdateWidgetData;

            // Update if an existing widget
            if (widgetData.id) {
                const widgetUpdate = await updateWidget(widgetData, context.debug.metadata);
                if (!widgetUpdate)
                    return logger(`ERROR - Failed to update existing ${widgetData.type} widget.`);

                logger(`INFO - Successfully updated ${widgetData.type} widget: ${widgetUpdate.id}`);

            } else {
                // Otherwise, create a new widget (net new or deleted above)
                const addedWidget = await context.reddit.addWidget(widgetData);
                if (!addedWidget)
                    return logger(`ERROR - Failed to add new ${widgetData.type} widget.`);

                logger(`INFO - Successfully added new ${widgetData.type} widget: ${addedWidget.id}`);
            }

            /* ---------- Save Last Modified ---------- */

            // Finally, write back the last-modified date (from API call) to Redis once all actions are successful
            const apiLastModified = apiResult.headers.get('Last-Modified');
            if (apiLastModified) {
                await context.redis.set(RedisKeys.SummaryLastModified, apiLastModified);
                logger(`INFO - Saved ${apiLastModified} from API as last modified`);

            } else {
                logger('WARN - API did not return a last modified date!');
            }

        } catch (ex) {
            console.log('[Summary Update Job] ERROR - Error while processing update:', ex)
        }
    }
});

export default Devvit;
