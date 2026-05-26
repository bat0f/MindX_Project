require('dotenv').config();
const express = require('express');
const router = require('./routes/indexRouter.js');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fileUpload = require('express-fileupload');
const sequelize = require('./database.js');
const { InvadersData, User, Role } = require('./models');
const errorHandler = require('./middlewares/ErrorHandlingMiddleware');
const securityAuditService = require('./services/securityAuditService');
const path = require('path');

const PORT = process.env.PORT;
const DEFAULT_USER_ROLE_ID = 'aff50f23-2fbc-41be-ba07-c1c69c5e388c';
const DEFAULT_ADMIN_ROLE_ID = '84f7f8b2-8b3e-4e1f-9f86-9e9d2d5a0b3a';

const corsOptions = {
  origin: ['https://playmindx.online'],
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: 'Content-Type,Authorization',
  credentials: true,
};

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    await securityAuditService.log({
      req,
      username: req.user?.username || null,
      action: 'security.suspicious.mass_requests',
      status: 'warning',
      targetType: 'route',
      targetId: req.originalUrl,
      details: {
        source: 'global_rate_limit',
        method: req.method,
      },
    });

    return res.status(429).json({
      error: 'Слишком много запросов, пожалуйста, повторите попытку позже.',
    });
  },
});

const app = express();
if (process.env.MODE === 'PROD') {
  app.use(cors(corsOptions));
  app.use(limiter);
  app.use(helmet());
} else {
  app.use(cors({ origin: true, credentials: true }));
}

app.use(express.json());
app.use('/api', express.static(path.resolve(__dirname, 'static')));
app.use(fileUpload({}));
app.use('/api', router);
app.use(errorHandler);

const ensureSystemRoles = async () => {
  const defaultUserRole = await Role.findByPk(DEFAULT_USER_ROLE_ID);
  if (!defaultUserRole) {
    const existingUserRole = await Role.findOne({ where: { name: 'USER' } });

    if (existingUserRole && existingUserRole.id !== DEFAULT_USER_ROLE_ID) {
      throw new Error(
        `System role USER exists with unexpected id ${existingUserRole.id}. Expected ${DEFAULT_USER_ROLE_ID}.`
      );
    }

    await Role.create({
      id: DEFAULT_USER_ROLE_ID,
      name: 'USER',
    });
  }

  const adminRole = await Role.findOne({ where: { name: 'ADMIN' } });
  if (!adminRole) {
    await Role.create({
      id: DEFAULT_ADMIN_ROLE_ID,
      name: 'ADMIN',
    });
  }
};

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS citext');
    await sequelize.sync();
    await ensureSystemRoles();

    const queryInterface = sequelize.getQueryInterface();
    const userTable = User.getTableName();
    const userColumns = await queryInterface.describeTable(userTable);

    if (!userColumns.email) {
      await queryInterface.addColumn(userTable, 'email', {
        type: sequelize.Sequelize.CITEXT,
        allowNull: true,
      });
    }
    if (!userColumns.isEmailVerified) {
      await queryInterface.addColumn(userTable, 'isEmailVerified', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!userColumns.isTwoFactorEnabled) {
      await queryInterface.addColumn(userTable, 'isTwoFactorEnabled', {
        type: sequelize.Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!userColumns.tokenVersion) {
      await queryInterface.addColumn(userTable, 'tokenVersion', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!userColumns.failedLoginAttempts) {
      await queryInterface.addColumn(userTable, 'failedLoginAttempts', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!userColumns.loginLockUntil) {
      await queryInterface.addColumn(userTable, 'loginLockUntil', {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
      });
    }
    if (!userColumns.lastPasswordChangedAt) {
      await queryInterface.addColumn(userTable, 'lastPasswordChangedAt', {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
      });
    }

    const invadersTable = InvadersData.getTableName();
    const invadersColumns = await queryInterface.describeTable(invadersTable);
    if (!invadersColumns.schoolClass) {
      await queryInterface.addColumn(invadersTable, 'schoolClass', {
        type: sequelize.Sequelize.STRING,
        allowNull: true,
      });
    }

    app.listen(PORT, () => console.log(`Сервер запущен на ${PORT} порту`));
  } catch (error) {
    console.log(error);
  }
};

start();
