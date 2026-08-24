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
    // The three a Runner attaches by convention. The source and the per-test
    // table are the participant's own work and its verdict; the log is where a
    // compiler says things about a solution, so it starts internal.
    attachmentVisibility: [
        { name: "source", visibility: "participant" },
        { name: "details", visibility: "participant" },
        { name: "log", visibility: "managersOnly" },
    ],
    joinPolicy: "closed",
    unlisted: true,
    // A finished round stays readable unless somebody says otherwise.
    hideEndedSeriesProblems: false,
    maxUploadBytes: 8 * MB,
    maxAttachments: 1,
    // The general Runners, which is where an activity nobody has pinned belongs.
    runnerTags: [],
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
    attachmentVisibility: activity.attachmentVisibility.map(rule => ({ ...rule })),
    joinPolicy: activity.joinPolicy,
    unlisted: activity.unlisted,
    joinPassword: activity.joinPassword,
    hideEndedSeriesProblems: activity.hideEndedSeriesProblems,
    maxUploadBytes: activity.maxUploadBytes,
    maxAttachments: activity.maxAttachments,
    maxSubmissionsPerProblem: activity.maxSubmissionsPerProblem,
    runnerTags: [...activity.runnerTags],
});

