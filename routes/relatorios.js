const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireMenu } = require('../middleware/permissions');

router.get('/', requireAuth, requireMenu('/relatorios'), (req, res) => {
  res.render('relatorios/index');
});

module.exports = router;
