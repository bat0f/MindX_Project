import './auth.scss';
import { ROUTES } from '@mindx/utils/consts.js';
import { API } from '@mindx/http/API.js';
import { useContext, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Context } from '@mindx/index.js';
import { ErrorEmmiter, SuccessEmmiter } from '@mindx/components/UI/Toastify/Notify.jsx';
import { mindxDebounce } from '@mindx/utils/tools';

const SignIn = observer(() => {
  const { user } = useContext(Context);
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState('');
  const [twoFactorMethod, setTwoFactorMethod] = useState('email');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(false);
  const [emailHint, setEmailHint] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);

  const completeAuth = (payload) => {
    user.setUser(payload.user);
    user.setIsAuth(true);
    if (payload.user.role === 'ADMIN') {
      user.setIsAdmin(true);
    }
    navigate(location.state?.from?.pathname || ROUTES.HOME_ROUTE);
    window.location.reload();
  };

  const signIn = mindxDebounce(async () => {
    try {
      const data = await API.user.SignIn(identifier.trim(), password);

      if (data?.requiresTwoFactor) {
        setChallengeToken(data.challengeToken);
        setTwoFactorMethod(data.method || 'email');
        setEmailHint(data.email || '');
        SuccessEmmiter(data.message || 'Код подтверждения запрошен.');
        return;
      }

      if (data?.user) {
        completeAuth(data);
      }
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || error?.response?.data?.message || 'Не удалось выполнить вход.');
    }
  });

  const verifyCode = mindxDebounce(async () => {
    try {
      const data = await API.user.VerifyTwoFactor(challengeToken, twoFactorCode, rememberDevice);
      completeAuth(data);
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || error?.response?.data?.message || 'Не удалось подтвердить код.');
    }
  });

  const requestReset = async () => {
    try {
      const data = await API.user.forgotPassword(resetEmail.trim());
      setResetRequested(true);
      SuccessEmmiter(data.message || 'Если такая почта существует, код отправлен.');
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось отправить код для сброса пароля.');
    }
  };

  const resetPassword = async () => {
    try {
      const data = await API.user.resetPassword(
        resetEmail.trim(),
        resetCode.trim(),
        newPassword,
        confirmNewPassword
      );
      SuccessEmmiter(data.message || 'Пароль успешно изменён.');
      setMode('signin');
      setResetRequested(false);
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось сбросить пароль.');
    }
  };

  return (
    <main className="auth-section">
      <div className="signin-section">
        <h1 className="auth-title">
          {challengeToken ? 'Подтверждение входа' : mode === 'reset' ? 'Восстановление пароля' : 'Вход'}
        </h1>
        <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
          {!challengeToken && mode === 'signin' && (
            <>
              <div>
                <label htmlFor="identifier">Логин или email</label>
                <input
                  type="text"
                  required
                  id="identifier"
                  className="auth-input"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password">Пароль</label>
                <div className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    id="password"
                    className="auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    maxLength={60}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
              </div>
              <button type="button" className="link-btn" onClick={() => setMode('reset')}>
                Забыли пароль?
              </button>
              <div className="btn-section">
                <a className="btn sign" href={ROUTES.SIGNUP_ROUTE}>
                  Нет аккаунта?
                </a>
                <button className="btn auth" onClick={signIn}>
                  Войти
                </button>
              </div>
            </>
          )}

          {challengeToken && (
            <>
              {twoFactorMethod === 'totp' ? (
                <p>Введите код из Google Authenticator или другого приложения-аутентификатора.</p>
              ) : (
                <p>
                  Код отправлен на почту: <strong>{emailHint}</strong>
                </p>
              )}
              <div>
                <label htmlFor="twoFactorCode">
                  {twoFactorMethod === 'totp' ? 'Код из приложения' : 'Код из письма'}
                </label>
                <input
                  type="text"
                  required
                  id="twoFactorCode"
                  className="auth-input"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  maxLength={6}
                />
              </div>
              <label className="remember-check">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                />
                Запомнить устройство на 30 дней
              </label>
              <div className="btn-section">
                <button
                  className="btn sign"
                  onClick={() => {
                    setChallengeToken('');
                    setTwoFactorMethod('email');
                    setTwoFactorCode('');
                    setRememberDevice(false);
                  }}
                >
                  Назад
                </button>
                <button className="btn auth" onClick={verifyCode}>
                  Подтвердить
                </button>
              </div>
            </>
          )}

          {!challengeToken && mode === 'reset' && (
            <>
              <div>
                <label htmlFor="resetEmail">Почта</label>
                <input
                  type="email"
                  id="resetEmail"
                  className="auth-input"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>

              {resetRequested && (
                <>
                  <div>
                    <label htmlFor="resetCode">Код из письма</label>
                    <input
                      type="text"
                      id="resetCode"
                      className="auth-input"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      maxLength={6}
                    />
                  </div>
                  <div>
                    <label htmlFor="newPassword">Новый пароль</label>
                    <div className="password-field">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        id="newPassword"
                        className="auth-input"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        aria-label={showNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        onClick={() => setShowNewPassword((value) => !value)}
                      >
                        {showNewPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="confirmNewPassword">Повторите пароль</label>
                    <div className="password-field">
                      <input
                        type={showConfirmNewPassword ? 'text' : 'password'}
                        id="confirmNewPassword"
                        className="auth-input"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        aria-label={showConfirmNewPassword ? 'Скрыть пароль' : 'Показать пароль'}
                        onClick={() => setShowConfirmNewPassword((value) => !value)}
                      >
                        {showConfirmNewPassword ? <FaEyeSlash /> : <FaEye />}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="btn-section">
                <button
                  className="btn sign"
                  onClick={() => {
                    setMode('signin');
                    setResetRequested(false);
                    setResetCode('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                  }}
                >
                  Назад
                </button>
                {!resetRequested ? (
                  <button className="btn auth" onClick={requestReset}>
                    Получить код
                  </button>
                ) : (
                  <button className="btn auth" onClick={resetPassword}>
                    Сбросить пароль
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      </div>
    </main>
  );
});

export default SignIn;
