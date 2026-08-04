'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dspShell', Object.freeze({
  powerOff() {
    ipcRenderer.send('dsp-shell:power-off');
  },
}));
