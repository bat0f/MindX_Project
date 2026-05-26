const Joi = require('../utils/validation');

const commonStringRules = Joi.string().messages({
    'string.empty': 'РџРѕР»Рµ {#key} РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј',
    'string.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ СЃС‚СЂРѕРєРѕР№',
    'string.guid': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІ С„РѕСЂРјР°С‚Рµ UUID',
    'string.isoDate': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІ С„РѕСЂРјР°С‚Рµ ISO РґР°С‚С‹',
    'any.required': 'РџРѕР»Рµ {#key} РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ',
})

const gameCreateSchema = Joi.object({
    typeGame: commonStringRules.required(),
    name: commonStringRules.required(),
    imageId: commonStringRules.guid().allow(null).default(null),
    startDate: commonStringRules.isoDate().required(),
    endDate: commonStringRules.isoDate().required().custom((value, helpers) => {
        const startDate = new Date(helpers.state.ancestors[0].startDate);
        const endDate = new Date(value);

        if (endDate <= startDate) {
            return helpers.message('РљРѕРЅРµС‡РЅР°СЏ РґР°С‚Р° РґРѕР»Р¶РЅР° Р±С‹С‚СЊ Р±РѕР»СЊС€Рµ РёР»Рё СЂР°РІРЅР° РЅР°С‡Р°Р»СЊРЅРѕР№ РґР°С‚Рµ')
        }

        return value;
    }, 'Date comparison'),

    questionGames: Joi.array().items(
        Joi.object({
            id: Joi.string().guid().required(),
        })
    ).required().messages({
        'string.empty': 'РџРѕР»Рµ {#key} РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј',
        'string.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ СЃС‚СЂРѕРєРѕР№',
        'string.guid': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІ С„РѕСЂРјР°С‚Рµ UUID',
        'any.required': 'РџРѕР»Рµ {#key} РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ',
    }),

    themeGames: Joi.array().items(
        Joi.object({
            id: Joi.string().guid().required()
        })
    ).allow(null).messages({
        'string.empty': 'РџРѕР»Рµ {#key} РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј',
        'string.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ СЃС‚СЂРѕРєРѕР№',
        'string.guid': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІ С„РѕСЂРјР°С‚Рµ UUID',
    }),

    accessGames: Joi.array().items(
        Joi.object({
            id: Joi.string().guid().required()
        })
    ).required().messages({
        'string.empty': 'РџРѕР»Рµ {#key} РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј',
        'string.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ СЃС‚СЂРѕРєРѕР№',
        'string.guid': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РІ С„РѕСЂРјР°С‚Рµ UUID',
    }),

    carouselData: Joi.object({
        scoreFirst: Joi.number().integer().required(),
        scoreSuccess: Joi.number().integer().required(),
        scoreFailure: Joi.number().integer().required(),
    }).allow(null).messages({
        'number.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ С‡РёСЃР»РѕРј',
        'any.required': 'РџРѕР»Рµ {#key} РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ',
    }),

    invadersData: Joi.object({
        schoolClass: commonStringRules.required(),
    }).allow(null).messages({
        'object.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕР±СЉРµРєС‚РѕРј',
        'any.required': 'РџРѕР»Рµ {#key} РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ',
    })
}).custom((value, helpers) => {
    if (value.typeGame === 'square') {
        if (!value.themeGames) {
            return helpers.message('РџРѕР»Рµ themeGames РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ');
        }
        if (value.themeGames.length !== 5) {
            return helpers.message('РњР°СЃСЃРёРІ themeGames РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ СЂРѕРІРЅРѕ 5 СЌР»РµРјРµРЅС‚РѕРІ');
        }
        if (value.questionGames.length !== 25) {
            return helpers.message('РњР°СЃСЃРёРІ questionGames РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ СЂРѕРІРЅРѕ 25 СЌР»РµРјРµРЅС‚РѕРІ');
        }
    }
    else if (value.typeGame === 'carousel') {
        if (!value.carouselData) {
            return helpers.message('РџРѕР»Рµ carouselData РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ');
        }
        if (value.questionGames.length === 0) {
            return helpers.message('РњР°СЃСЃРёРІ questionGames РґРѕР»Р¶РµРЅ СЃРѕРґРµСЂР¶Р°С‚СЊ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ СЌР»РµРјРµРЅС‚');
        }
    }
    else if (value.typeGame === 'invaders') {
        if (!value.invadersData?.schoolClass) {
            return helpers.message('РџРѕР»Рµ invadersData.schoolClass РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ');
        }
    }
    else if (value.typeGame === 'tictactoe') {
        if (!Array.isArray(value.questionGames)) {
            return helpers.message('Поле questionGames должно быть массивом');
        }
    }
    return value;
}).messages({
    'any.required': 'РџРѕР»Рµ {#key} РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ РґР»СЏ Р·Р°РїРѕР»РЅРµРЅРёСЏ',
    'array.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РјР°СЃСЃРёРІРѕРј',
    'object.base': 'РџРѕР»Рµ {#key} РґРѕР»Р¶РЅРѕ Р±С‹С‚СЊ РѕР±СЉРµРєС‚РѕРј'
});

module.exports = { gameCreateSchema };
