"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobController = exports.updateJobSchema = exports.createJobSchema = void 0;
const zod_1 = require("zod");
const prisma_1 = require("../../database/prisma");
const job_policy_1 = require("../../policies/job.policy");
const response_1 = require("../../utils/response");
const roles_1 = require("../../rbac/roles");
exports.createJobSchema = zod_1.z.object({
    title: zod_1.z.string().min(3),
    requisitionId: zod_1.z.string().uuid().optional(),
    departmentId: zod_1.z.string().uuid(),
    hiringManagerId: zod_1.z.string().uuid(),
    description: zod_1.z.string().min(10),
    location: zod_1.z.string().default('Hanoi'),
});
exports.updateJobSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).optional(),
    description: zod_1.z.string().min(10).optional(),
    location: zod_1.z.string().optional(),
    recruiterId: zod_1.z.string().uuid().optional(),
});
class JobController {
    static async list(req, res) {
        const user = req.user;
        let whereClause = {};
        // Candidate can only view published job postings
        if (user.roles.includes(roles_1.RoleType.CANDIDATE)) {
            whereClause = { status: 'PUBLISHED' };
        }
        else if (user.roles.includes(roles_1.RoleType.HIRING_MANAGER)) {
            whereClause = {
                OR: [
                    { hiringManagerId: user.id },
                    user.departmentId ? { departmentId: user.departmentId } : {},
                ],
            };
        }
        const jobs = await prisma_1.prisma.job.findMany({
            where: whereClause,
            include: {
                department: true,
                hiringManager: { select: { id: true, fullName: true, email: true } },
                recruiter: { select: { id: true, fullName: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        (0, response_1.successResponse)(res, jobs, 200);
    }
    static async getById(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canView = await job_policy_1.JobPolicy.canView(user, id);
        if (!canView) {
            (0, response_1.errorResponse)(res, 'Access denied. You cannot view this job posting.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const job = await prisma_1.prisma.job.findUnique({
            where: { id },
            include: {
                department: true,
                hiringManager: { select: { id: true, fullName: true, email: true } },
                recruiter: { select: { id: true, fullName: true, email: true } },
            },
        });
        if (!job) {
            (0, response_1.errorResponse)(res, 'Job posting not found.', 404, 'NOT_FOUND');
            return;
        }
        (0, response_1.successResponse)(res, job, 200);
    }
    static async create(req, res) {
        const data = req.body;
        const user = req.user;
        const job = await prisma_1.prisma.job.create({
            data: {
                title: data.title,
                requisitionId: data.requisitionId,
                departmentId: data.departmentId,
                hiringManagerId: data.hiringManagerId,
                recruiterId: user.id,
                description: data.description,
                location: data.location,
                status: 'DRAFT',
            },
        });
        (0, response_1.successResponse)(res, job, 201, 'Job posting created in DRAFT state.');
    }
    static async update(req, res) {
        const { id } = req.params;
        const user = req.user;
        const canUpdate = await job_policy_1.JobPolicy.canUpdate(user, id);
        if (!canUpdate) {
            (0, response_1.errorResponse)(res, 'Access denied. You cannot update this job.', 403, 'FORBIDDEN_SCOPE');
            return;
        }
        const updated = await prisma_1.prisma.job.update({
            where: { id },
            data: req.body,
        });
        (0, response_1.successResponse)(res, updated, 200, 'Job updated successfully.');
    }
    static async publish(req, res) {
        const { id } = req.params;
        const updated = await prisma_1.prisma.job.update({
            where: { id },
            data: { status: 'PUBLISHED' },
        });
        (0, response_1.successResponse)(res, updated, 200, 'Job posting is now PUBLISHED.');
    }
}
exports.JobController = JobController;
