import { Router } from 'express';
import { PublicJobsController } from './public-jobs.controller';
import { PublicJobApplicationController } from './public-job-application.controller';
import { uploadCvMiddleware } from './cv-upload.middleware';
import { applicationRateLimiter } from '../../middleware/rate-limiter';

const router = Router();

// S4-03: chỉ thêm một API ứng tuyển, KHÔNG ghi đè API công khai S4-01/S4-02.
router.post('/:id/apply', applicationRateLimiter, uploadCvMiddleware, (req, res, next) => {
  void PublicJobApplicationController.submitApplication(req, res).catch(next);
});

// SCRUM-116: Ứng viên có thể xem danh sách việc làm đang tuyển công khai mà không cần tài khoản
// Hỗ trợ tìm kiếm từ khóa trong tiêu đề, mô tả và lọc theo phòng ban, địa điểm, hình thức làm việc.
router.get('/', PublicJobsController.list);

// Chi tiết việc làm công khai
router.get('/:id', PublicJobsController.getById);

export default router;
