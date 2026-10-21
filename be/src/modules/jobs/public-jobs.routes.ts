import { Router } from 'express';
import { PublicJobsController } from './public-jobs.controller';

const router = Router();

// SCRUM-116: Ứng viên có thể xem danh sách việc làm đang tuyển công khai mà không cần tài khoản
// Hỗ trợ tìm kiếm từ khóa trong tiêu đề, mô tả và lọc theo phòng ban, địa điểm, hình thức làm việc.
router.get('/', PublicJobsController.list);

// Chi tiết việc làm công khai
router.get('/:id', PublicJobsController.getById);

export default router;
