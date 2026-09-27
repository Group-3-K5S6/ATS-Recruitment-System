"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const error_handler_1 = require("./middleware/error-handler");
const response_1 = require("./utils/response");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const candidate_routes_1 = __importDefault(require("./modules/candidates/candidate.routes"));
const requisition_routes_1 = __importDefault(require("./modules/requisitions/requisition.routes"));
const job_routes_1 = __importDefault(require("./modules/jobs/job.routes"));
const interview_routes_1 = __importDefault(require("./modules/interviews/interview.routes"));
const evaluation_routes_1 = __importDefault(require("./modules/evaluations/evaluation.routes"));
const offer_routes_1 = __importDefault(require("./modules/offers/offer.routes"));
const report_routes_1 = __importDefault(require("./modules/reports/report.routes"));
const user_routes_1 = __importDefault(require("./modules/users/user.routes"));
const audit_log_routes_1 = __importDefault(require("./modules/audit-logs/audit-log.routes"));
function createApp() {
    const app = (0, express_1.default)();
    // Security Middlewares
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    // Health check
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    // API Routes
    app.use('/api/auth', auth_routes_1.default);
    app.use('/api/candidates', candidate_routes_1.default);
    app.use('/api/requisitions', requisition_routes_1.default);
    app.use('/api/jobs', job_routes_1.default);
    app.use('/api/interviews', interview_routes_1.default);
    app.use('/api/evaluations', evaluation_routes_1.default);
    app.use('/api/offers', offer_routes_1.default);
    app.use('/api/reports', report_routes_1.default);
    app.use('/api/users', user_routes_1.default);
    app.use('/api/audit-logs', audit_log_routes_1.default);
    // Catch-all 404
    app.use((_req, res) => {
        (0, response_1.errorResponse)(res, 'Route not found.', 404, 'NOT_FOUND');
    });
    // Centralized Error Handling
    app.use(error_handler_1.errorHandler);
    return app;
}
exports.app = createApp();
