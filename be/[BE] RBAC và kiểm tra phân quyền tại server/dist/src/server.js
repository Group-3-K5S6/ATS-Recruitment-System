"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const server = app_1.app.listen(env_1.env.PORT, () => {
    console.log(`ATS Backend RBAC Service running on port ${env_1.env.PORT} in ${env_1.env.NODE_ENV} mode.`);
});
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});
