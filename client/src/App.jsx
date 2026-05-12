import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import LandingPage from './pages/LandingPage';
import TeacherLayout from './layouts/TeacherLayout';
import AssistantLayout from './layouts/AssistantLayout';
import StudentLayout from './layouts/StudentLayout';
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherStudents from './pages/teacher/Students';
import TeacherCourses from './pages/teacher/Courses';
import TeacherExams from './pages/teacher/Exams';
import TeacherAssistants from './pages/teacher/Assistants';
import TeacherAnalytics from './pages/teacher/Analytics';
import TeacherPayments from './pages/teacher/Payments';
import TeacherLeaderboard from './pages/teacher/Leaderboard';
import TeacherNotifications from './pages/teacher/Notifications';
import TeacherBackup from './pages/teacher/Backup';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherRequests from './pages/teacher/Requests';
import EssayGrading from './pages/teacher/EssayGrading';
import WrongQuestionsPage from './pages/teacher/WrongQuestions';
import AssistantDashboard from './pages/assistant/Dashboard';
import AssistantStudents from './pages/assistant/Students';
import AssistantExams from './pages/teacher/Exams';
import AssistantAnalytics from './pages/assistant/Analytics';
import AssistantCourses from './pages/assistant/Courses';
import AssistantPayments from './pages/assistant/Payments';
import StudentDashboard from './pages/student/Dashboard';
import StudentCourses from './pages/student/Courses';
import StudentCourseView from './pages/student/CourseView';
import StudentExams from './pages/student/Exams';
import StudentLeaderboard from './pages/student/Leaderboard';
import StudentMyStats from './pages/student/MyStats';
import StudentNotifications from './pages/student/Notifications';
import ExamReviewPage from './pages/ExamReviewPage';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
};

const AppRoutes = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <Login />} />

      <Route path="/teacher" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherLayout /></ProtectedRoute>}>
        <Route index element={<TeacherDashboard />} />
        <Route path="students" element={<TeacherStudents />} />
        <Route path="courses" element={<TeacherCourses />} />
        <Route path="exams" element={<TeacherExams />} />
        <Route path="assistants" element={<TeacherAssistants />} />
        <Route path="analytics" element={<TeacherAnalytics />} />
        <Route path="payments" element={<TeacherPayments />} />
        <Route path="leaderboard" element={<TeacherLeaderboard />} />
        <Route path="notifications" element={<TeacherNotifications />} />
        <Route path="backup" element={<TeacherBackup />} />
        <Route path="attendance" element={<TeacherAttendance />} />
        <Route path="requests" element={<TeacherRequests />} />
        <Route path="essay-grading" element={<EssayGrading />} />
        <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
        <Route path="wrong-questions" element={<WrongQuestionsPage />} />
      </Route>

      <Route path="/assistant" element={<ProtectedRoute allowedRoles={['assistant']}><AssistantLayout /></ProtectedRoute>}>
        <Route index element={<AssistantDashboard />} />
        <Route path="students" element={<AssistantStudents />} />
        <Route path="exams" element={<AssistantExams />} />
        <Route path="courses" element={<AssistantCourses />} />
        <Route path="payments" element={<AssistantPayments />} />
        <Route path="analytics" element={<AssistantAnalytics />} />
        <Route path="notifications" element={<TeacherNotifications />} />
        <Route path="requests" element={<TeacherRequests />} />
        <Route path="essay-grading" element={<EssayGrading />} />
        <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
      </Route>

      <Route path="/student" element={<ProtectedRoute allowedRoles={['student']}><StudentLayout /></ProtectedRoute>}>
        <Route index element={<StudentDashboard />} />
        <Route path="courses" element={<StudentCourses />} />
        <Route path="courses/:courseId" element={<StudentCourseView />} />
        <Route path="exams" element={<StudentExams />} />
        <Route path="stats" element={<StudentMyStats />} />
        <Route path="notifications" element={<StudentNotifications />} />
        <Route path="leaderboard" element={<StudentLeaderboard />} />
        <Route path="exam-review/:resultId" element={<ExamReviewPage />} />
      </Route>

      <Route path="/" element={user ? <Navigate to={`/${user.role}`} replace /> : <LandingPage />} />
      <Route path="*" element={<Navigate to={user ? `/${user.role}` : '/'} replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
