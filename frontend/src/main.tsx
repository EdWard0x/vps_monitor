import { captureServerChanCallback } from './lib/serverchanBinding';

// Dynamic import guarantees the URL is cleaned before the router and app initialize.
captureServerChanCallback(window.location, window.history);
void import('./bootstrap');

