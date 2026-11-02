export type RootStackParamList = {
    Loading: undefined;
    Login: undefined;
    Home: undefined;
    CreateGoal: undefined;
    GoalDetail: { goalId: string; title: string };
    PlanReview: { planId: string; goalTitle: string };
    TaskDetail: { taskId: string };
    Activity: undefined;
    Settings: undefined;
};
