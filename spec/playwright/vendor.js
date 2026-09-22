/* global window */
const DataGrid = require('devextreme/ui/data_grid');
const {exportDataGrid} = require('devextreme/excel_exporter');

window.DataGrid = DataGrid.default || DataGrid;
window.exportDataGrid = exportDataGrid;
