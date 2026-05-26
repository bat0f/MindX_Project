const ApiError = require('../error/ApiError');
const mathTicTacToeService = require('../services/mathTicTacToeService');

class MathTicTacToeController {
  async sessions(req, res, next) {
    try {
      const sessions = await mathTicTacToeService.listSessions(req.params.id, req.user.id);
      return res.json({ success: true, sessions });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async createSession(req, res, next) {
    try {
      const state = await mathTicTacToeService.createSession(req.params.id, req.user, req.body);
      return res.json({ success: true, state });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async joinSession(req, res, next) {
    try {
      const state = await mathTicTacToeService.joinSession(req.params.id, req.params.sessionId, req.user);
      return res.json({ success: true, state });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async join(req, res, next) {
    try {
      const state = await mathTicTacToeService.joinGame(req.params.id, req.user);
      return res.json({ success: true, state });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async state(req, res, next) {
    try {
      const state = await mathTicTacToeService.getState(req.params.id, req.user.id, req.query.sessionId);
      return res.json({ success: true, state });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async settings(req, res, next) {
    try {
      const state = await mathTicTacToeService.updateSettings(req.params.id, req.user.id, req.body);
      return res.json({ success: true, state });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async ready(req, res, next) {
    try {
      const { isReady = true, sessionId } = req.body || {};
      const result = await mathTicTacToeService.setReady(req.params.id, req.user.id, isReady, sessionId);
      return res.json({ success: true, ...result });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async move(req, res, next) {
    try {
      const { row, col, sessionId } = req.body;
      const result = await mathTicTacToeService.requestMove(req.params.id, req.user.id, row, col, sessionId);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async answer(req, res, next) {
    try {
      const { answer, sessionId } = req.body;
      const result = await mathTicTacToeService.submitAnswer(req.params.id, req.user.id, answer, sessionId);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async timeout(req, res, next) {
    try {
      const { sessionId } = req.body || {};
      const result = await mathTicTacToeService.timeout(req.params.id, req.user.id, sessionId);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async leave(req, res, next) {
    try {
      const { sessionId } = req.body || {};
      const result = await mathTicTacToeService.leaveGame(req.params.id, req.user.id, sessionId);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async rematch(req, res, next) {
    try {
      const { sessionId } = req.body || {};
      const result = await mathTicTacToeService.rematch(req.params.id, req.user.id, sessionId);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }
}

module.exports = new MathTicTacToeController();
