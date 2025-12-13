/**
 * Router Component
 *
 * Main application router with dynamic module routes
 */


import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AppShell } from '../layout/AppShell';
import { getAllModules } from '../../modules/registry';
import { Login } from './Login';
import { NotFound } from './NotFound';
import { Unauthorized } from './Unauthorized';

/**
 * Create router with dynamic module routes
 */
function createAppRouter() {
  const modules = getAllModules();

  return createBrowserRouter([
    {
      path: '/login',
      element: <Login />,
    },
    {
      path: '/',
      element: <AppShell />,
      children: [
        {
          index: true,
          element: <Navigate to="/dashboard" replace />,
        },
        // Dynamically add module routes
        ...modules.map((module) => ({
          path: module.basePath,
          children: module.routes,
        })),
        {
          path: '/unauthorized',
          element: <Unauthorized />,
        },
        {
          path: '*',
          element: <NotFound />,
        },
      ],
    },
  ]);
}

export function Router() {
  const router = createAppRouter();
  return <RouterProvider router={router} />;
}
