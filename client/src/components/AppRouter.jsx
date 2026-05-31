import React, { useContext } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { PUBLIC_ROUTES, AUTH_ROUTES, ADMIN_ROUTES } from '../routes';
import { ROUTES } from '../utils/consts';
import { Context } from '../index';

const AppRouter = () => {
  const {user} = useContext(Context);
  const location = useLocation();

  const renderRoute = ({ path, Component, type }) => (
    <Route key={path} path={path} element={type ? <Component type={type}/> : <Component />} />
  );

  const renderProtectedRoute = ({ path }) => (
    <Route
      key={path}
      path={path}
      element={<Navigate to={ROUTES.SIGNIN_ROUTE} replace state={{ from: location }} />}
    />
  );

  return (
    <Routes>
      {PUBLIC_ROUTES.map(renderRoute)}
      {user.isAuth ? AUTH_ROUTES.map(renderRoute) : AUTH_ROUTES.map(renderProtectedRoute)}
      {user.isAdmin && ADMIN_ROUTES.map(renderRoute)}
      <Route path="*" element={<Navigate to={ROUTES.HOME_ROUTE} />} />
    </Routes>
  );
}

export default AppRouter;
