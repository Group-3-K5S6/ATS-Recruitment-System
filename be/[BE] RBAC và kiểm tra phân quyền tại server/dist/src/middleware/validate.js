"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
const zod_1 = require("zod");
const response_1 = require("../utils/response");
function validateBody(schema) {
    return (req, res, next) => {
        try {
            req.body = schema.parse(req.body);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                const issues = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
                (0, response_1.errorResponse)(res, `Validation error: ${issues}`, 400, 'VALIDATION_ERROR');
                return;
            }
            (0, response_1.errorResponse)(res, 'Invalid request payload format.', 400, 'INVALID_PAYLOAD');
        }
    };
}
