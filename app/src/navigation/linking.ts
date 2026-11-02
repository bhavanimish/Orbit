import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['/'],
  config: {
    screens: {
      Loading: 'loading',
      Login: 'login',
      Home: '',
      CreateGoal: 'goals/new',
      GoalDetail: {
        path: 'goals/:goalId',
      },
      PlanReview: {
        path: 'plans/:planId',
      },
      TaskDetail: {
        path: 'tasks/:taskId',
      },
      Activity: 'activity',
      Settings: 'settings',
    },
  },
};

