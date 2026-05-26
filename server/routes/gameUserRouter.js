const Router = require('express')
const router = new Router()
const userAnswerController = require('../controllers/userAnswerController')
const gameController = require('../controllers/gameController')
const mathInvadersController = require('../controllers/mathInvadersController')
const mathTicTacToeController = require('../controllers/mathTicTacToeController')
const checkRoleForGameMiddleware = require('../middlewares/checkRoleForGameMiddleware')
const checkStartEndGameMiddleware = require('../middlewares/checkStartEndGameMiddleware')
const validateRequest = require("../middlewares/validateRequest");
const { userAnswerSchema } = require("../schemas/userAnswerSchema");

router.post('/:id/tictactoe/join', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.join)
router.get('/:id/tictactoe/state', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.state)
router.post('/:id/tictactoe/settings', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.settings)
router.post('/:id/tictactoe/ready', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.ready)
router.post('/:id/tictactoe/move', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.move)
router.post('/:id/tictactoe/answer', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.answer)
router.post('/:id/tictactoe/timeout', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.timeout)
router.post('/:id/tictactoe/rematch', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathTicTacToeController.rematch)

router.post('/:id/invaders/join', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.join)
router.post('/:id/invaders/ready', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.ready)
router.get('/:id/invaders/state', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.state)
router.post('/:id/invaders/move', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.move)
router.post('/:id/invaders/spend', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.spend)
router.post('/:id/invaders/capture', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.capture)
router.post('/:id/invaders/answer', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.answer)
router.post('/:id/invaders/timeout', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), mathInvadersController.timeout)

router.get('/:id', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), gameController.getOne)
router.post('/:id', checkRoleForGameMiddleware(), checkStartEndGameMiddleware(), validateRequest(userAnswerSchema),
    userAnswerController.create.bind(userAnswerController))

module.exports = router
