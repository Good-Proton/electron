import { expect } from 'chai';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

import { BrowserWindow, WebPreferences } from 'electron/main';

import { closeWindow } from './window-helpers';
import { AddressInfo } from 'net';
import { emittedUntil } from './events-helpers';
import { ifit } from './spec-helpers';

const features = process._linkedBinding('electron_common_features');

const messageContainsSecurityWarning = (event: Event, level: number, message: string) => {
  return message.indexOf('Electron Security Warning') > -1;
};

const isLoaded = (event: Event, level: number, message: string) => {
  return (message === 'loaded');
};

describe('security warnings', () => {
  let server: http.Server;
  let w: BrowserWindow;
  let useCsp = true;
  let useTrustedTypes = false;
  let serverUrl: string;

  before((done) => {
    // Create HTTP Server
    server = http.createServer((request, response) => {
      const uri = url.parse(request.url!).pathname!;
      let filename = path.join(__dirname, '..', 'spec', 'fixtures', 'pages', uri);

      fs.stat(filename, (error, stats) => {
        if (error) {
          response.writeHead(404, { 'Content-Type': 'text/plain' });
          response.end();
          return;
        }

        if (stats.isDirectory()) {
          filename += '/index.html';
        }

        fs.readFile(filename, 'binary', (err, file) => {
          if (err) {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.end();
            return;
          }

          const cspHeaders = [
            ...(useCsp ? ['script-src \'self\' \'unsafe-inline\''] : []),
            ...(useTrustedTypes ? ['require-trusted-types-for \'script\'; trusted-types *'] : [])
          ];
          response.writeHead(200, { 'Content-Security-Policy': cspHeaders });
          response.write(file, 'binary');
          response.end();
        });
      });
    }).listen(0, '127.0.0.1', () => {
      serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  after(() => {
    // Close server
    server.close();
    server = null as unknown as any;
  });

  afterEach(async () => {
    useCsp = true;
    useTrustedTypes = false;
    await closeWindow(w);
    w = null as unknown as any;
  });

  it('should warn about Node.js integration with remote content', async () => {
    w = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    w.loadURL(`${serverUrl}/base-page-security.html`);
    const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
    expect(message).to.include('Node.js Integration with Remote Content');
  });

  it('should not warn about Node.js integration with remote content from localhost', async () => {
    w = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true
      }
    });

    w.loadURL(`${serverUrl}/base-page-security-onload-message.html`);
    const [,, message] = await emittedUntil(w.webContents, 'console-message', isLoaded);
    expect(message).to.not.include('Node.js Integration with Remote Content');
  });

  const generateSpecs = (description: string, webPreferences: WebPreferences) => {
    describe(description, () => {
      it('should warn about disabled webSecurity', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            webSecurity: false,
            ...webPreferences
          }
        });

        w.loadURL(`${serverUrl}/base-page-security.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('Disabled webSecurity');
      });

      it('should warn about insecure Content-Security-Policy', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            enableRemoteModule: false,
            ...webPreferences
          }
        });

        useCsp = false;
        w.loadURL(`${serverUrl}/base-page-security.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('Insecure Content-Security-Policy');
      });

      it('should warn about insecure Content-Security-Policy (Trusted Types)', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            enableRemoteModule: false,
            ...webPreferences
          }
        });

        useCsp = false;
        useTrustedTypes = true;
        w.loadURL(`${serverUrl}/base-page-security.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('Insecure Content-Security-Policy');
      });

      it('should warn about allowRunningInsecureContent', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            allowRunningInsecureContent: true,
            ...webPreferences
          }
        });

        w.loadURL(`${serverUrl}/base-page-security.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('allowRunningInsecureContent');
      });

      it('should warn about experimentalFeatures', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            experimentalFeatures: true,
            ...webPreferences
          }
        });

        w.loadURL(`${serverUrl}/base-page-security.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('experimentalFeatures');
      });

      it('should warn about enableBlinkFeatures', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            enableBlinkFeatures: 'my-cool-feature',
            ...webPreferences
          }
        });

        w.loadURL(`${serverUrl}/base-page-security.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('enableBlinkFeatures');
      });

      it('should warn about allowpopups', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences
        });

        w.loadURL(`${serverUrl}/webview-allowpopups.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('allowpopups');
      });

      it('should warn about insecure resources', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: { ...webPreferences }
        });

        w.loadURL(`${serverUrl}/insecure-resources.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('Insecure Resources');
      });

      it('should not warn about loading insecure-resources.html from localhost', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences
        });

        w.loadURL(`${serverUrl}/insecure-resources.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.not.include('insecure-resources.html');
      });

      ifit(features.isRemoteModuleEnabled())('should warn about enabled remote module with remote content', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            enableRemoteModule: true,
            ...webPreferences
          }
        });

        w.loadURL(`${serverUrl}/base-page-security.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', messageContainsSecurityWarning);
        expect(message).to.include('enableRemoteModule');
      });

      ifit(features.isRemoteModuleEnabled())('should not warn about enabled remote module with remote content from localhost', async () => {
        w = new BrowserWindow({
          show: false,
          webPreferences: {
            enableRemoteModule: true,
            ...webPreferences
          }
        });
        w.loadURL(`${serverUrl}/base-page-security-onload-message.html`);
        const [,, message] = await emittedUntil(w.webContents, 'console-message', isLoaded);
        expect(message).to.not.include('enableRemoteModule');
      });
    });
  };

  generateSpecs('without sandbox', { contextIsolation: false });
  generateSpecs('with sandbox', { sandbox: true, contextIsolation: false });
});
