import './userSettingsModal.scss';
import { useEffect, useState } from 'react';
import { API } from '@mindx/http/API';
import { ErrorEmmiter, SuccessEmmiter } from '@mindx/components/UI/Toastify/Notify';

const UserSettingsModal = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [form, setForm] = useState({
    username: '',
    email: '',
    isTwoFactorEnabled: false,
    isTotpEnabled: false,
    isEmailVerified: true,
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [passwordResetRequested, setPasswordResetRequested] = useState(false);
  const [passwordResetCode, setPasswordResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const loadSessions = async () => {
    try {
      setSessionsLoading(true);
      const data = await API.user.getSessions();
      setSessions(data);
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось загрузить список сессий.');
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setLoading(true);
    Promise.all([API.user.getProfile(), API.user.getSessions()])
      .then(([profile, sessionList]) => {
        setForm({
          username: profile.username || '',
          email: profile.email || '',
          isTwoFactorEnabled: Boolean(profile.isTwoFactorEnabled),
          isTotpEnabled: Boolean(profile.isTotpEnabled),
          isEmailVerified: Boolean(profile.isEmailVerified),
        });
        setTotpSetup(null);
        setTotpCode('');
        setTotpDisableCode('');
        setSessions(sessionList);
      })
      .catch((error) => {
        ErrorEmmiter(error?.response?.data?.error || 'Не удалось загрузить настройки.');
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const saveSettings = async () => {
    try {
      const payload = {
        username: form.username.trim(),
        email: form.email.trim(),
      };

      const response = await API.user.updateProfile(payload);
      SuccessEmmiter(response.message || 'Настройки сохранены.');

      if (response.message?.includes('Подтвердите новую почту')) {
        setForm((prev) => ({
          ...prev,
          isEmailVerified: false,
        }));
      }

      await loadSessions();
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось сохранить настройки.');
    }
  };

  const saveTwoFactorSettings = async () => {
    try {
      const response = await API.user.updateProfile({
        isTwoFactorEnabled: form.isTwoFactorEnabled,
      });
      SuccessEmmiter(response.message || 'Настройка двухэтапной аутентификации сохранена.');
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось сохранить настройку двухэтапной аутентификации.');
    }
  };

  const startTotpSetup = async () => {
    try {
      setTotpLoading(true);
      const response = await API.user.setupTotp();
      setTotpSetup(response);
      setTotpCode('');
      SuccessEmmiter(response.message || 'Добавьте ключ в приложение-аутентификатор.');
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось начать настройку TOTP.');
    } finally {
      setTotpLoading(false);
    }
  };

  const confirmTotp = async () => {
    try {
      setTotpLoading(true);
      const response = await API.user.confirmTotp(totpCode.trim());
      setForm((prev) => ({ ...prev, isTotpEnabled: true }));
      setTotpSetup(null);
      setTotpCode('');
      SuccessEmmiter(response.message || 'TOTP включён.');
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось подтвердить TOTP.');
    } finally {
      setTotpLoading(false);
    }
  };

  const disableTotp = async () => {
    try {
      setTotpLoading(true);
      const response = await API.user.disableTotp(totpDisableCode.trim());
      setForm((prev) => ({ ...prev, isTotpEnabled: false }));
      setTotpDisableCode('');
      SuccessEmmiter(response.message || 'TOTP отключён.');
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось отключить TOTP.');
    } finally {
      setTotpLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    try {
      if (!newPassword.trim() || !confirmNewPassword.trim()) {
        ErrorEmmiter('Сначала введите новый пароль и его подтверждение.');
        return;
      }

      if (newPassword !== confirmNewPassword) {
        ErrorEmmiter('Пароли не совпадают.');
        return;
      }

      const response = await API.user.forgotPassword(form.email.trim());
      setPasswordResetRequested(true);
      SuccessEmmiter(response.message || 'Код для смены пароля отправлен на почту.');
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось отправить код для смены пароля.');
    }
  };

  const confirmPasswordReset = async () => {
    try {
      const response = await API.user.resetPassword(
        form.email.trim(),
        passwordResetCode.trim(),
        newPassword,
        confirmNewPassword
      );
      SuccessEmmiter(response.message || 'Пароль изменён. Войдите снова.');
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось изменить пароль.');
    }
  };

  const verifyEmail = async () => {
    try {
      const response = await API.user.VerifyEmail(form.email.trim(), verificationCode.trim());
      SuccessEmmiter(response.message || 'Почта подтверждена.');
      setForm((prev) => ({ ...prev, isEmailVerified: true }));
      setVerificationCode('');
      window.location.reload();
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось подтвердить почту.');
    }
  };

  const resendCode = async () => {
    try {
      const response = await API.user.resendVerification(form.email.trim());
      SuccessEmmiter(response.message);
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось отправить код повторно.');
    }
  };

  const logoutSession = async (sessionId, isCurrent) => {
    try {
      const response = await API.user.logoutSession(sessionId);
      SuccessEmmiter(response.message || 'Сессия завершена.');

      if (isCurrent) {
        window.location.reload();
        return;
      }

      await loadSessions();
    } catch (error) {
      ErrorEmmiter(error?.response?.data?.error || 'Не удалось завершить сессию.');
    }
  };

  const formatSessionTitle = (session) => {
    if (!session.userAgent) {
      return 'Неизвестное устройство';
    }

    return session.userAgent.length > 90 ? `${session.userAgent.slice(0, 90)}...` : session.userAgent;
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Настройки пользователя</h2>
          <button type="button" onClick={onClose}>
            x
          </button>
        </div>

        {loading ? (
          <p>Загрузка...</p>
        ) : (
          <div className="settings-form">
            <label>
              Логин
              <input
                type="text"
                value={form.username}
                onChange={(e) => handleChange('username', e.target.value)}
              />
            </label>

            <label>
              Почта
              <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} />
            </label>

            <div className="password-box">
              <div className="settings-actions settings-actions--between">
                <div>
                  <h3>Смена пароля</h3>
                  <p className="settings-hint">
                    Сначала задайте новый пароль, затем подтвердите смену кодом из письма.
                  </p>
                </div>
                {!passwordResetRequested && (
                  <button type="button" className="primary-btn" onClick={requestPasswordReset}>
                    Получить код
                  </button>
                )}
              </div>

              <div className="password-reset-form">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Новый пароль"
                />
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                />

                {passwordResetRequested && (
                  <>
                    <input
                      type="text"
                      value={passwordResetCode}
                      onChange={(e) => setPasswordResetCode(e.target.value)}
                      placeholder="Код из письма"
                      maxLength={6}
                    />
                    <div className="settings-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setPasswordResetRequested(false);
                          setPasswordResetCode('');
                        }}
                      >
                        Отмена
                      </button>
                      <button type="button" className="primary-btn" onClick={confirmPasswordReset}>
                        Подтвердить смену
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <label className="settings-check">
              <input
                type="checkbox"
                checked={form.isTwoFactorEnabled}
                onChange={(e) => handleChange('isTwoFactorEnabled', e.target.checked)}
              />
              Включить двухэтапную аутентификацию
            </label>

            <div className="settings-actions settings-actions--between">
              <span className="settings-hint">Эта кнопка сохраняет только настройку 2FA.</span>
              <button type="button" className="primary-btn" onClick={saveTwoFactorSettings}>
                Сохранить 2FA
              </button>
            </div>

            <div className="totp-box">
              <div className="settings-actions settings-actions--between">
                <div>
                  <h3>TOTP (Google Authenticator)</h3>
                  <p className="settings-hint">
                    Альтернативная защита входа: приложение генерирует новый 6-значный код каждые 30 секунд.
                  </p>
                </div>
                <span className={form.isTotpEnabled ? 'totp-status totp-status--on' : 'totp-status'}>
                  {form.isTotpEnabled ? 'Включён' : 'Отключён'}
                </span>
              </div>

              {!form.isTotpEnabled && !totpSetup && (
                <button type="button" className="primary-btn" onClick={startTotpSetup} disabled={totpLoading}>
                  Настроить Google Authenticator
                </button>
              )}

              {!form.isTotpEnabled && totpSetup && (
                <div className="totp-setup">
                  <p className="settings-hint">
                    В Google Authenticator нажмите добавление аккаунта и отсканируйте QR-код. Если камера недоступна,
                    введите ключ вручную.
                  </p>
                  <div className="totp-qr-wrap">
                    <img src={totpSetup.qrCodeDataUrl} alt="QR-код для Google Authenticator" className="totp-qr" />
                  </div>
                  <label>
                    Резервный ключ настройки
                    <input className="totp-secret" type="text" value={totpSetup.secret} readOnly />
                  </label>
                  <input
                    type="text"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    placeholder="Код из приложения"
                    maxLength={6}
                  />
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => {
                        setTotpSetup(null);
                        setTotpCode('');
                      }}
                      disabled={totpLoading}
                    >
                      Отмена
                    </button>
                    <button type="button" className="primary-btn" onClick={confirmTotp} disabled={totpLoading}>
                      Подтвердить TOTP
                    </button>
                  </div>
                </div>
              )}

              {form.isTotpEnabled && (
                <div className="totp-setup">
                  <p className="settings-hint">
                    Для отключения введите текущий код из приложения-аутентификатора.
                  </p>
                  <input
                    type="text"
                    value={totpDisableCode}
                    onChange={(e) => setTotpDisableCode(e.target.value)}
                    placeholder="Код из приложения"
                    maxLength={6}
                  />
                  <button type="button" className="secondary-btn" onClick={disableTotp} disabled={totpLoading}>
                    Отключить TOTP
                  </button>
                </div>
              )}
            </div>

            {!form.isEmailVerified && (
              <div className="email-verification-box">
                <p>Почта не подтверждена. Введите код из письма.</p>
                <input
                  type="text"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Код подтверждения"
                />
                <div className="settings-actions">
                  <button type="button" className="secondary-btn" onClick={resendCode}>
                    Отправить код ещё раз
                  </button>
                  <button type="button" className="primary-btn" onClick={verifyEmail}>
                    Подтвердить почту
                  </button>
                </div>
              </div>
            )}

            <div className="session-box">
              <div className="settings-actions settings-actions--between">
                <h3>Активные устройства</h3>
                <button type="button" className="secondary-btn" onClick={loadSessions}>
                  Обновить
                </button>
              </div>

              {sessionsLoading ? (
                <p>Загрузка списка сессий...</p>
              ) : sessions.length === 0 ? (
                <p>Активных сессий пока нет.</p>
              ) : (
                <div className="session-list">
                  {sessions.map((session) => (
                    <div className="session-item" key={session.sessionId}>
                      <div className="session-item__content">
                        <strong>
                          {formatSessionTitle(session)}
                          {session.isCurrent ? ' (текущая)' : ''}
                        </strong>
                        <span>IP: {session.ipAddress || 'не определён'}</span>
                        <span>
                          Последняя активность:{' '}
                          {session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleString('ru-RU') : 'нет данных'}
                        </span>
                        <span>
                          Истекает: {session.expiresAt ? new Date(session.expiresAt).toLocaleString('ru-RU') : 'нет данных'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => logoutSession(session.sessionId, session.isCurrent)}
                      >
                        Завершить
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="settings-actions">
              <button type="button" className="secondary-btn" onClick={onClose}>
                Закрыть
              </button>
              <button type="button" className="primary-btn" onClick={saveSettings}>
                Сохранить профиль
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSettingsModal;
