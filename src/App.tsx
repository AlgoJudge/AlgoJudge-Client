import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './App.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { lazy } from 'react';
import Layout from './Layout';
import HomePage from './pages/home/HomePage';
import LoginPage from './pages/login/LoginPage';

import RegisterPage from './pages/register/RegisterPage';
import AppLayout from './layouts/app/AppLayout';
import ActivitiesPage from './pages/activities/ActivitiesPage';
import ProblemsPage from './pages/activities/activity_id/problems/ProblemsPage';
import SubmitPage from './pages/activities/activity_id/submit/SubmitPage';
import SubmissionsPage from './pages/activities/activity_id/submissions/SubmissionsPage';
import RankingPage from './pages/activities/activity_id/ranking/RankingPage';
import QuestionsPage from './pages/activities/activity_id/questions/QuestionsPage';
import RulesPage from './pages/activities/activity_id/rules/RulesPage';
import ProblemPage from './pages/activities/activity_id/problems/problem_id/ProblemPage';
import SubmissionPage from './pages/activities/activity_id/submissions/submission_id/SubmissionPage';
import CodePage from './pages/activities/activity_id/submissions/submission_id/code/CodePage';

import { ApiProvider } from './provider/ApiProvider';
import { AuthProvider } from './provider/AuthProvider';
import RequireSession from './routers/Authentication';
const AccountPage = lazy(() => import('./pages/account/AccountPage'));

// The manager panel is a different application wearing the same shell, and a
// participant never opens it. Split out so they do not download it.
const ManagerPage = lazy(() => import('./pages/manager/ManagerPage'));
const UsersPage = lazy(() => import('./pages/manager/users/UsersPage'));
const RunnersPage = lazy(() => import('./pages/manager/runners/RunnersPage'));
const ManagerActivitiesPage = lazy(() => import('./pages/manager/activities/ManagerActivitiesPage'));
const ManagerActivityPage = lazy(() => import('./pages/manager/activities/activity_id/ManagerActivityPage'));
const PermissionTemplatesPage = lazy(() => import('./pages/manager/permission_templates/PermissionTemplatesPage'));
const GrantsPage = lazy(() => import('./pages/manager/grants/GrantsPage'));
const ManagerProblemsPage = lazy(() => import('./pages/manager/problems/ManagerProblemsPage'));
const ManagerProblemPage = lazy(() => import('./pages/manager/problems/problem_id/ManagerProblemPage'));
const ManagerSubmissionsPage = lazy(() => import('./pages/manager/submissions/ManagerSubmissionsPage'));
const ManagerSubmissionPage = lazy(() => import('./pages/manager/submissions/submission_id/ManagerSubmissionPage'));
const ManagerQuestionsPage = lazy(() => import('./pages/manager/questions/ManagerQuestionsPage'));

function App() {

    const router = createBrowserRouter([
        {
            path: "/",
            element: <Layout />,
            children: [
                {
                    path: "/",
                    element: <HomePage />
                },
                {
                    path: "/login",
                    element: <LoginPage />
                },
                {
                    path: "/register",
                    element: <RegisterPage />
                },
            ]
        },
        {
            path: "/",
            // One guard for the whole application shell: every participant and
            // manager screen is a child of it, so there is no route that can be
            // added later and forgotten here.
            element: <RequireSession><AppLayout /></RequireSession>,
            children: [
                {
                    path: "/account",
                    element: <AccountPage />
                },
                {
                    path: "/activities",
                    element: <ActivitiesPage />
                },
                {
                    path: "/activities/:activityId/problems",
                    element: <ProblemsPage />
                },
                {
                    path: "/activities/:activityId/submit/:problemId?",
                    element: <SubmitPage />
                },
                {
                    path: "/activities/:activityId/submissions",
                    element: <SubmissionsPage />
                },
                {
                    path: "/activities/:activityId/ranking",
                    element: <RankingPage />
                },
                {
                    path: "/activities/:activityId/questions",
                    element: <QuestionsPage />
                },
                {
                    path: "/activities/:activityId/rules",
                    element: <RulesPage />
                },
                {
                    path: "/activities/:activityId/problems/:problemId",
                    element: <ProblemPage />
                },
                {
                    path: "/activities/:activityId/submissions/:submissionId",
                    element: <SubmissionPage />
                },
                {
                    path: "/activities/:activityId/submissions/:submissionId/code",
                    element: <CodePage />
                },
                {
                    path: "/manager",
                    element: <ManagerPage />
                },
                {
                    path: "/manager/activities",
                    element: <ManagerActivitiesPage />
                },
                {
                    path: "/manager/activities/:activityId",
                    element: <ManagerActivityPage />
                },
                {
                    path: "/manager/users",
                    element: <UsersPage />
                },
                {
                    path: "/manager/problems",
                    element: <ManagerProblemsPage />
                },
                {
                    path: "/manager/problems/:problemId",
                    element: <ManagerProblemPage />
                },
                {
                    path: "/manager/submissions",
                    element: <ManagerSubmissionsPage />
                },
                {
                    path: "/manager/submissions/:submissionId",
                    element: <ManagerSubmissionPage />
                },
                {
                    path: "/manager/questions",
                    element: <ManagerQuestionsPage />
                },
                {
                    path: "/manager/grants",
                    element: <GrantsPage />
                },
                {
                    path: "/manager/permission-templates",
                    element: <PermissionTemplatesPage />
                },
                {
                    path: "/manager/runners",
                    element: <RunnersPage />
                }
            ]
        }
    ], { basename: import.meta.env.BASE_URL });

    return (
            <MantineProvider>
                <ApiProvider>
                    {/* Above the router, so the application shell sees the same
                        session as the public one. */}
                    <AuthProvider>
                        <Notifications />
                        <RouterProvider router={router} />
                    </AuthProvider>
                </ApiProvider>
            </MantineProvider>
    );
}

export default App;