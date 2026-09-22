const express = require('express');
const path = require('path');

const app = express();
const root = path.resolve(__dirname, '../..');
app.use('/dist', express.static(path.join(root, 'dist')));
app.use('/build', express.static(path.join(root, 'build')));
app.use('/vendor', express.static(path.join(root, 'node_modules')));
app.use(express.static(__dirname));
app.listen(3187, '127.0.0.1');
