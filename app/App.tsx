import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import LoadingScreen from './src/screens/LoadingScreen';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import CreateGoalScreen from './src/screens/CreateGoalScreen';
import GoalDetailScreen from './src/screens/GoalDetailScreen';
import PlanReviewScreen from './src/screens/PlanReviewScreen';
import TaskDetailScreen from './src/screens/TaskDetailScreen';
import { linking } from './src/navigation/linking';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { user, loading } = useAuth();

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#090A0F' },
        }}
      >
        {loading ? (
          <Stack.Screen name="Loading" component={LoadingScreen} />
        ) : user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="CreateGoal" component={CreateGoalScreen} />
            <Stack.Screen name="GoalDetail" component={GoalDetailScreen} />
            <Stack.Screen name="PlanReview" component={PlanReviewScreen} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
