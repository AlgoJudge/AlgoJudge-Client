import { ActivityInput, ManagedActivity } from "../../api/ManagerApi";

/**
 * The two conversions the activity form needs, kept beside it rather than in it:
 * a component file that also exports helpers loses fast refresh.
 */

export const MB = 1024 * 1024;

export const emptyActivity = (): ActivityInput => ({
    slug: "",
    name: "",
    type: "contest@1",
    rankingType: "points",
    timeZone: "Europe/Warsaw",
    modules: { questions: true },
    scoreVisibility: "everyone",
    logVisibility: "managersOnly",
    joinPolicy: "closed",
    unlisted: true,
    // A finished round stays readable unless somebody says otherwise.
    hideEndedSeriesProblems: false,
    maxUploadBytes: 8 * MB,
    maxAttachments: 1,
});

export const toInput = (activity: ManagedActivity): ActivityInput => ({
    slug: activity.slug,
    name: activity.name,
    type: activity.type,
    rankingType: activity.rankingType,
    timeZone: activity.timeZone,
    startDate: activity.startDate,
    endDate: activity.endDate,
    modules: { ...activity.modules },
    scoreVisibility: activity.scoreVisibility,
    logVisibility: activity.logVisibility,
    joinPolicy: activity.joinPolicy,
    unlisted: activity.unlisted,
    joinPassword: activity.joinPassword,
    hideEndedSeriesProblems: activity.hideEndedSeriesProblems,
    maxUploadBytes: activity.maxUploadBytes,
    maxAttachments: activity.maxAttachments,
    maxSubmissionsPerProblem: activity.maxSubmissionsPerProblem,
});

