import React from 'react';
import {createRoot} from 'react-dom/client';
import TeacherApp from './TeacherApp.jsx';
import './teacher-styles.css';
import {TeacherCloudProvider} from './teacher/TeacherCloud';

document.body.classList.add('print-mode-batch', 'teacher-workspace');
createRoot(document.getElementById('root')!).render(<TeacherCloudProvider><TeacherApp /></TeacherCloudProvider>);
