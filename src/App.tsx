import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './App.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import Layout from './Layout';
import Home from './pages/home/Home';
import Login from './pages/login/Login';
import Manage from './pages/manage/Manage';
import Register from './pages/register/Register';
import Authentication from './routers/Authentication';
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

function App() {

    const router = createBrowserRouter([
        {
            path: "/",
            element: <Layout />,
            children: [
                {
                    path: "/",
                    element: <Home />
                },
                {
                    path: "/login",
                    element: <Login />
                },
                {
                    path: "/register",
                    element: <Register />
                },
                {
                    path: "/manage",
                    element: <Authentication><Manage /></Authentication>
                }
            ]
        },
        {
            path: "/",
            element: <AppLayout />,
            children: [
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
                }
            ]
        }
    ], { basename: import.meta.env.BASE_URL });

    return (
            <MantineProvider>
                <Notifications />
                <RouterProvider router={router} />
            </MantineProvider>
    );
}

export default App;