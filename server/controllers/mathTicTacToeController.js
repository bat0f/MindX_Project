const ApiError = require('../error/ApiError');
const mathTicTacToeService = require('../services/mathTicTacToeService');

class MathTicTacToeController {
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
      const state = await mathTicTacToeService.getState(req.params.id, req.user.id);
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
      const { isReady = true } = req.body || {};
      const result = await mathTicTacToeService.setReady(req.params.id, req.user.id, isReady);
      return res.json({ success: true, ...result });
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async move(req, res, next) {
    try {
      const { row, col } = req.body;
      const result = await mathTicTacToeService.requestMove(req.params.id, req.user.id, row, col);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async answer(req, res, next) {
    try {
      const { answer } = req.body;
      const result = await mathTicTacToeService.submitAnswer(req.params.id, req.user.id, answer);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async timeout(req, res, next) {
    try {
      const result = await mathTicTacToeService.timeout(req.params.id, req.user.id);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }

  async rematch(req, res, next) {
    try {
      const result = await mathTicTacToeService.rematch(req.params.id, req.user.id);
      return res.json(result);
    } catch (error) {
      return next(ApiError.badRequest(error.message));
    }
  }
}

module.exports = new MathTicTacToeController();
