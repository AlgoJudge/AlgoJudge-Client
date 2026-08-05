import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './App.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import { lazy, ReactNode } from 'react';
import Layout from './Layout';
import HomePage from './pages/home/HomePage';
import LoginPage from './pages/login/LoginPage';

import RegisterPage from './pages/register/RegisterPage';
import AppLayout from './layouts/app/AppLayout';
import SessionShell from './layouts/SessionShell';
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
import { InstanceProvider } from './provider/InstanceProvider';
import { PermissionsProvider } from './provider/PermissionsProvider';
import RequireSession from './routers/Authentication';
import RequirePermission from './routers/RequirePermission';
import { areaFor, MANAGER_PERMISSIONS } from './pages/manager/managerAreas';
const AccountPage = lazy(() => import('./pages/account/AccountPage'));
const LegalPage = lazy(() => import('./pages/legal/LegalPage'));

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

    /**
     * A manager route, with what the panel's own table says it needs.
     *
     * Read from that table rather than repeated here, so a screen cannot end up
     * listed in the menu under one permission and guarded by another.
     */
    const managerRoute = (path: string, element: ReactNode) => ({
        path,
        element: (
            <RequirePermission permissions={areaFor(path)?.permissions ?? MANAGER_PERMISSIONS}>
                {element}
            </RequirePermission>
        ),
    });

    const router = createBrowserRouter([
        // Every shell below is a layout route without a path of its own. Given
        // one, a shell whose children do not match still matches the address by
        // itself, and then draws its chrome around an empty page — which is what
        // `/` did the moment a second shell was added beside the first.
        {
            // The visitor's shell, and only the visitor's: an application shell
            // around a sign-in form would offer navigation to nowhere.
            element: <Layout />,
            children: [
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
            // Public, but with a signed-in reading of the same page. The front
            // page already shows the operator's other document to somebody
            // signed in, and the legal documents must stay open to everybody —
            // somebody has to be able to read the privacy policy before deciding
            // whether to have an account at all. The shell follows the session
            // so that reading one does not take the application away.
            element: <SessionShell />,
            children: [
                {
                    path: "/",
                    element: <HomePage />
                },
                {
                    path: "/terms",
                    element: <LegalPage />
                },
                {
                    path: "/privacy",
                    element: <LegalPage />
                },
                {
                    path: "/cookies",
                    element: <LegalPage />
                },
                {
                    path: "/accessibility",
                    element: <LegalPage />
                },
            ]
        },
        {
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
                managerRoute("/manager", <ManagerPage />),
                managerRoute("/manager/activities", <ManagerActivitiesPage />),
                managerRoute("/manager/activities/:activityId", <ManagerActivityPage />),
                managerRoute("/manager/users", <UsersPage />),
                managerRoute("/manager/problems", <ManagerProblemsPage />),
                managerRoute("/manager/problems/:problemId", <ManagerProblemPage />),
                managerRoute("/manager/submissions", <ManagerSubmissionsPage />),
                managerRoute("/manager/submissions/:submissionId", <ManagerSubmissionPage />),
                managerRoute("/manager/questions", <ManagerQuestionsPage />),
                managerRoute("/manager/grants", <GrantsPage />),
                managerRoute("/manager/permission-templates", <PermissionTemplatesPage />),
                managerRoute("/manager/runners", <RunnersPage />)
            ]
        }
    ], { basename: import.meta.env.BASE_URL });

    return (
            <MantineProvider>
                <ApiProvider>
                    {/* Above the router, so the application shell sees the same
                        session as the public one. Permissions sit inside the
                        session, because they are a property of it. */}
                    <AuthProvider>
                        <InstanceProvider>
                            <PermissionsProvider>
                                <Notifications />
                                <RouterProvider router={router} />
                            </PermissionsProvider>
                        </InstanceProvider>
                    </AuthProvider>
                </ApiProvider>
            </MantineProvider>
    );
}

export default App;