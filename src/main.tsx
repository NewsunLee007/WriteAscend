import React from 'react';
import {createRoot} from 'react-dom/client';
import TeacherApp from './TeacherApp.jsx';
import './teacher-styles.css';

document.body.classList.add('print-mode-batch', 'teacher-workspace');
createRoot(document.getElementById('root')!).render(<TeacherApp />);
