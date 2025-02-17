/*
 * Helper methods for accessing available methods on the Reddit API, but not currently exposed in the Devvit Public API.
 *
 * Author: Based on guidance / sample from PitchforkAssistant. Modified / customized by Beach-Brews.
 */

import * as protos from '@devvit/protos';
import {Devvit} from '@devvit/public-api';

export type RedditAPIPlugins = {
    Widgets: protos.Widgets;
};

export type ExtendedDevvit = typeof Devvit & {
    redditAPIPlugins: RedditAPIPlugins
};

export function getExtendedDevvit(): ExtendedDevvit {
    return Devvit as ExtendedDevvit;
}

export type UpdateWidgetData = (protos.UpdateImageWidgetRequest & { type: "image" }) |
    (protos.UpdateTextAreaWidgetRequest & { type: "textarea" });

export type UpdateWidgetResponse = protos.ImageWidget | protos.TextAreaWidget;

export function updateWidget(widgetData: UpdateWidgetData, metadata: protos.Metadata): Promise<UpdateWidgetResponse> {
    switch (widgetData?.type) {
        case 'image':
            return getExtendedDevvit().redditAPIPlugins.Widgets.UpdateImageWidget(widgetData, metadata);
        case 'textarea':
            return getExtendedDevvit().redditAPIPlugins.Widgets.UpdateTextAreaWidget(widgetData, metadata);
        default:
            throw new Error('Unknown widget type');
    }
}