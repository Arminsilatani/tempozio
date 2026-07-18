(function() {
    'use strict';

    /* :::::::::::::::::::::::::: CONFIGURATION & CONSTANTS :::::::::::::::::::::::::: */
    const SUPABASE_URL = 'https://vzqicidepdmraygulrey.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_kqRWgOmLISOE2EuLL1s8fw_WN6FJRTI';
    const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const ROLE_HIERARCHY = ['recruit', 'sergeant', 'commander', 'general'];
    const APP_MIN_ROLE = 'commander';

    const CATEGORY_GROUPS = [
        {
            label: 'Job/Work Activities',
            items: ['Planning', 'Design', 'Development', 'Testing (QA)', 'Research', 'Review', 'Meeting', 'Deployment', 'Documentation', 'Admin/Tracking']
        },
        {
            label: 'Learning/Skill Building',
            items: ['Learning (Study)', 'Certification', 'Language Practice', 'Experimentation']
        },
        {
            label: 'Personal/Health',
            items: ['Break/Rest', 'Exercise', 'Personal Care', 'Household']
        },
        {
            label: 'IT-Related',
            items: ['IT Maintenance', 'AI Exploration', 'Security']
        },
        {
            label: 'Other Important Categories',
            items: ['Open Source', 'Travel/Commute', 'Vacation/Holiday']
        }
    ];

    /* :::::::::::::::::::::::::: GLOBAL STATE :::::::::::::::::::::::::: */
    let currentUser = null;
    let currentProfile = null;
    let currentUserRole = 'public';
    let sidebarComponent = null;
    let projects = [];
    let tickerInterval = null;
    let newProjectLogoFile = null;
    let editLogoFile = null;
    let currentModalProjectId = null;
    let tempozioInitDone = false;

    let cropperInstance = null;
    let currentCropCallback = null;

    /* :::::::::::::::::::::::::: ACCESS CONTROL :::::::::::::::::::::::::: */
    function hasMinRole(userRole) {
        const normalized = String(userRole || '').trim().toLowerCase();
        const userIndex = ROLE_HIERARCHY.indexOf(normalized);
        const minIndex = ROLE_HIERARCHY.indexOf(APP_MIN_ROLE);
        return userIndex >= minIndex;
    }

    function showAccessDenied(message = 'Access denied.') {
        const overlay = document.createElement('div');
        overlay.id = 'access-denied-overlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(0, 0, 0, 0.7);
            backdrop-filter: blur(12px);
            display: flex; align-items: center; justify-content: center;
            animation: fadeIn 0.3s ease;
        `;
        const box = document.createElement('div');
        box.style.cssText = `
            background: rgba(20, 20, 20, 0.9);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 32px 40px;
            text-align: center;
            color: #FFF;
            font-family: inherit;
            font-size: 16px;
            max-width: 400px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            transform: scale(0.9);
            animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        `;
        box.innerHTML = `
            <div style="margin-bottom:12px; display:flex; justify-content:center;">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width:40px; height:40px; color: var(--accent, #FF6F91);">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
            </div>
            <p style="margin:0; line-height:1.5;">${message}</p>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        if (!document.getElementById('access-denied-styles')) {
            const style = document.createElement('style');
            style.id = 'access-denied-styles';
            style.textContent = `
                @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
                @keyframes popIn { 0% { transform: scale(0.8); opacity:0; } 100% { transform: scale(1); opacity:1; } }
            `;
            document.head.appendChild(style);
        }
    }

    /* :::::::::::::::::::::::::: DOM REFERENCES :::::::::::::::::::::::::: */
    const elements = {
        loader: document.getElementById('initial-loader'),
        authOverlay: document.getElementById('auth-overlay'),
        appContainer: document.getElementById('app-container'),
        track: document.getElementById('projects-list'),
        carousel: document.getElementById('projects-carousel'),
        emptyState: document.getElementById('empty-state'),
        arrowLeft: document.querySelector('.nav-arrow-left'),
        arrowRight: document.querySelector('.nav-arrow-right'),
        modalOverlay: document.getElementById('project-modal'),
        modalContent: document.querySelector('#project-modal .modal-content'),
        weeklyChartContainer: document.getElementById('weekly-chart-container'),
        breakdownList: document.getElementById('breakdown-list')
    };

    /* :::::::::::::::::::::::::: UTILITY FUNCTIONS :::::::::::::::::::::::::: */
    function showGlobalLoader() {
        const loader = document.getElementById('initial-loader');
        if (loader) loader.classList.remove('hidden');
    }

    function hideGlobalLoader() {
        const loader = document.getElementById('initial-loader');
        if (loader) loader.classList.add('hidden');
    }

    function openModal(modal) {
        if (!modal) return;
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }

    function closeModal(modal) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
    }

    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 167, g: 255, b: 61 };
    }

    function formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        const pad = (n) => n.toString().padStart(2, '0');
        return `${pad(h)}:${pad(m)}:${pad(s)}`;
    }

    function formatTimeShort(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    }

    function formatDateTime(ts) {
        return new Date(ts).toLocaleString();
    }

    function formatTimeOnly(ts) {
        return new Date(ts).toLocaleTimeString();
    }

    function generateId() {
        return '_' + Math.random().toString(36).substr(2, 9);
    }

    function getDisplayElapsed(project) {
        if (!project.isRunning) return project.elapsed;
        return project.elapsed + (Date.now() - project.lastStartTime);
    }

    /* :::::::::::::::::::::::::: IMAGE CROPPER HELPERS :::::::::::::::::::::::::: */
    function openCropperModal(file, callback) {
        const modal = document.getElementById('crop-modal');
        const img = document.getElementById('crop-image');
        if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
        img.src = URL.createObjectURL(file);
        if (cropperInstance) cropperInstance.destroy();
        cropperInstance = new Cropper(img, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 1,
            background: false,
        });
        currentCropCallback = callback;
        openModal(modal);
    }

    function setupCropListeners() {
        document.getElementById('crop-save-btn').addEventListener('click', () => {
            if (!cropperInstance) return;
            const canvas = cropperInstance.getCroppedCanvas({ width: 150, height: 150 });
            canvas.toBlob(blob => {
                if (blob) {
                    const croppedFile = new File([blob], 'cropped-logo.webp', { type: 'image/webp' });
                    if (currentCropCallback) currentCropCallback(croppedFile);
                }
                closeModal(document.getElementById('crop-modal'));
                cropperInstance.destroy();
                cropperInstance = null;
                currentCropCallback = null;
                const img = document.getElementById('crop-image');
                if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
            }, 'image/webp', 0.8);
        });

        document.getElementById('crop-cancel-btn').addEventListener('click', () => {
            closeModal(document.getElementById('crop-modal'));
            cropperInstance.destroy();
            cropperInstance = null;
            currentCropCallback = null;
            const img = document.getElementById('crop-image');
            if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
        });

        document.getElementById('crop-close').addEventListener('click', () => {
            document.getElementById('crop-cancel-btn').click();
        });
    }

    /* :::::::::::::::::::::::::: CATEGORY MANAGEMENT :::::::::::::::::::::::::: */
    function initCategoryDropdown(containerId, hiddenInputId, initialValues = []) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const maxSelections = 2;
        let selected = new Set(initialValues);
        let searchTerm = '';

        function getAllCategories() {
            return CATEGORY_GROUPS.flatMap(group => group.items);
        }

        function renderMenuPills() {
            const allCategories = getAllCategories();
            let html = '';
            allCategories.forEach(item => {
                const isSelected = selected.has(item);
                const matchesSearch = item.toLowerCase().includes(searchTerm.toLowerCase());
                html += `
                    <button type="button" class="category-pill ${isSelected ? 'selected' : ''}" 
                        data-value="${escapeHtml(item)}" 
                        style="${matchesSearch ? '' : 'display:none;'}">
                        ${escapeHtml(item)}
                    </button>
                `;
            });
            return html;
        }

        function renderDisplayPills() {
            if (selected.size === 0) return 'Select categories (max 2)';
            return Array.from(selected).map(item =>
                `<span class="display-pill" data-value="${escapeHtml(item)}">${escapeHtml(item)}</span>`
            ).join('');
        }

        container.innerHTML = `
            <input type="hidden" id="${hiddenInputId}" value="${Array.from(selected).join(', ')}">
            <div class="category-dropdown" id="${containerId}-dropdown" data-open="false">
                <div class="category-display" id="${containerId}-display">${renderDisplayPills()}</div>
                <button type="button" class="category-toggle-btn" id="${containerId}-toggle">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="chevron-icon">
                        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
                    </svg>
                </button>
                <div class="category-dropdown-menu" id="${containerId}-menu">
                    <div class="category-search-wrapper prefixed-input">
                        <span class="prefix">Category:</span>
                        <input type="text" class="category-search" placeholder="Search..." id="${containerId}-search">
                    </div>
                    <div class="category-pills-container" id="${containerId}-list">
                        ${renderMenuPills()}
                    </div>
                    ${selected.size >= maxSelections ? '<div class="category-limit-msg">Maximum 2 categories selected</div>' : ''}
                </div>
            </div>
        `;

        const hiddenInput = document.getElementById(hiddenInputId);
        const dropdown = document.getElementById(`${containerId}-dropdown`);
        const display = document.getElementById(`${containerId}-display`);
        const searchInput = document.getElementById(`${containerId}-search`);
        const pillsContainer = document.getElementById(`${containerId}-list`);

        function updateHiddenInput() {
            if (hiddenInput) hiddenInput.value = Array.from(selected).join(', ');
        }

        function openMenu() {
            dropdown.setAttribute('data-open', 'true');
            setTimeout(() => searchInput.focus(), 50);
        }

        function closeMenu() {
            dropdown.setAttribute('data-open', 'false');
        }

        dropdown.addEventListener('click', (e) => {
            if (e.target.closest('.category-dropdown-menu')) return;
            dropdown.getAttribute('data-open') === 'true' ? closeMenu() : openMenu();
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) closeMenu();
        });

        document.getElementById(`${containerId}-menu`).addEventListener('click', (e) => e.stopPropagation());

        searchInput.addEventListener('input', () => {
            searchTerm = searchInput.value;
            const pills = pillsContainer.querySelectorAll('.category-pill');
            pills.forEach(pill => {
                const matches = pill.dataset.value.toLowerCase().includes(searchTerm.toLowerCase());
                pill.style.display = matches ? '' : 'none';
            });
        });

        pillsContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.category-pill');
            if (!pill) return;
            const value = pill.dataset.value;

            if (selected.has(value)) {
                selected.delete(value);
                pill.classList.remove('selected');
            } else {
                if (selected.size >= maxSelections) {
                    const limitMsg = dropdown.querySelector('.category-limit-msg');
                    if (limitMsg) {
                        limitMsg.style.color = 'var(--accent)';
                        setTimeout(() => { if (limitMsg) limitMsg.style.color = ''; }, 500);
                    }
                    return;
                }
                selected.add(value);
                pill.classList.add('selected');
            }

            display.innerHTML = renderDisplayPills();
            updateHiddenInput();

            const existingMsg = dropdown.querySelector('.category-limit-msg');
            if (selected.size >= maxSelections) {
                if (!existingMsg) {
                    const msg = document.createElement('div');
                    msg.className = 'category-limit-msg';
                    msg.textContent = 'Maximum 2 categories selected';
                    pillsContainer.after(msg);
                }
            } else {
                if (existingMsg) existingMsg.remove();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeMenu();
        });
    }

    /* :::::::::::::::::::::::::: AUTH FUNCTIONS :::::::::::::::::::::::::: */
    async function checkEmailExists(email) {
        const { data } = await sb
            .from('profiles')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        return !!data;
    }

    async function buildCurrentProfile(user) {
        const { data: profile } = await sb
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
        const md = user.user_metadata || {};
        return {
            id: user.id,
            first_name: profile?.first_name ?? md.first_name ?? '',
            last_name: profile?.last_name ?? md.last_name ?? '',
            photo_url: profile?.photo_url ?? md.photo_url ?? '',
            username: profile?.username ?? md.username ?? '',
            role: profile?.role ?? md.role ?? 'recruit'
        };
    }

    function showAuthStep(stepId) {
        document.querySelectorAll('.auth-step').forEach(s => s.classList.remove('auth-step--active'));
        document.getElementById(stepId).classList.add('auth-step--active');
    }

    async function authRestoreSession() {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user) {
            const profile = await buildCurrentProfile(session.user);
            if (!hasMinRole(profile.role)) {
                await sb.auth.signOut();
                showAccessDenied('Access denied. Your role is not sufficient.');
                return;
            }
            currentUser = session.user;
            currentProfile = profile;
            currentUserRole = profile.role;
            syncSidebarComponent();
        }
    }

    function setupAuthListeners() {
        document.getElementById('auth-continue-btn').addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value.trim();
            const errorEl = document.getElementById('auth-error-1');
            const continueBtn = document.getElementById('auth-continue-btn');

            errorEl.classList.add('hidden');

            if (!email) {
                errorEl.textContent = 'Please enter your email.';
                errorEl.classList.remove('hidden');
                return;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errorEl.textContent = 'Please enter a valid email.';
                errorEl.classList.remove('hidden');
                return;
            }

            const originalText = continueBtn.textContent;
            continueBtn.disabled = true;
            continueBtn.textContent = 'Checking…';

            try {
                const exists = await checkEmailExists(email);
                if (exists) {
                    document.getElementById('login-email-display').textContent = email;
                    showAuthStep('step-2-login');
                } else {
                    document.getElementById('register-email-display').value = email;
                    showAuthStep('step-2-register');
                }
            } catch (err) {
                errorEl.textContent = 'Something went wrong. Please try again.';
                errorEl.classList.remove('hidden');
                console.error(err);
            } finally {
                continueBtn.disabled = false;
                continueBtn.textContent = originalText;
            }
        });

        // Sign In
        document.getElementById('auth-signin-btn').addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password-login').value;
            const errorEl = document.getElementById('auth-error-login');
            errorEl.classList.add('hidden');
            if (!password) {
                errorEl.textContent = 'Password required.';
                errorEl.classList.remove('hidden');
                return;
            }
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
                return;
            }
            const profile = await buildCurrentProfile(data.user);
            if (!hasMinRole(profile.role)) {
                await sb.auth.signOut();
                showAccessDenied('Access denied. Your role is not sufficient.');
                closeModal(document.getElementById('auth-overlay'));
                return;
            }
            currentUser = data.user;
            currentProfile = profile;
            currentUserRole = profile.role;
            closeModal(document.getElementById('auth-overlay'));
            syncSidebarComponent();
        });

        // Register
        document.getElementById('auth-register-btn').addEventListener('click', async () => {
            const email = document.getElementById('auth-email').value.trim();
            const firstName = document.getElementById('auth-first-name').value.trim();
            const lastName = document.getElementById('auth-last-name').value.trim();
            const password = document.getElementById('auth-password-register').value;
            const confirm = document.getElementById('auth-confirm-password').value;
            const errorEl = document.getElementById('auth-error-register');
            errorEl.classList.add('hidden');
            if (!firstName || !lastName) {
                errorEl.textContent = 'First and last name required.';
                errorEl.classList.remove('hidden');
                return;
            }
            if (password.length < 6) {
                errorEl.textContent = 'Password min 6 characters.';
                errorEl.classList.remove('hidden');
                return;
            }
            if (password !== confirm) {
                errorEl.textContent = 'Passwords do not match.';
                errorEl.classList.remove('hidden');
                return;
            }
            const { error } = await sb.auth.signUp({
                email,
                password,
                options: {
                    data: { first_name: firstName, last_name: lastName },
                    emailRedirectTo: window.location.origin + window.location.pathname
                }
            });
            if (error) {
                errorEl.textContent = error.message;
                errorEl.classList.remove('hidden');
                return;
            }
            alert('Registration successful! Check your email.');
            closeModal(document.getElementById('auth-overlay'));
        });

        // Back buttons
        document.getElementById('auth-back-to-email').addEventListener('click', () => showAuthStep('step-1'));
        document.getElementById('auth-back-to-email-2').addEventListener('click', () => showAuthStep('step-1'));

        // Forgot password
        document.getElementById('forgot-link').addEventListener('click', (e) => {
            e.preventDefault();
            showAuthStep('step-forgot');
        });

        document.getElementById('auth-reset-btn').addEventListener('click', async () => {
            const email = document.getElementById('forgot-email').value.trim();
            const msgEl = document.getElementById('forgot-message');
            msgEl.classList.add('hidden');
            if (!email) {
                msgEl.textContent = 'Please enter your email.';
                msgEl.classList.remove('hidden');
                return;
            }
            const { error } = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            });
            msgEl.classList.remove('hidden');
            if (error) {
                msgEl.textContent = error.message;
                msgEl.style.color = 'var(--error)';
            } else {
                msgEl.textContent = 'Reset link sent! Check your email.';
                msgEl.style.color = 'var(--accent)';
            }
        });

        document.getElementById('auth-back-to-login').addEventListener('click', () => showAuthStep('step-2-login'));
    }

    /* :::::::::::::::::::::::::: SIDEBAR & UI HELPERS :::::::::::::::::::::::::: */
    function initSidebarListeners() {
        const sidebar = document.querySelector('sidebar-component');
        if (!sidebar) return;
        sidebar.addEventListener('login-request', () => {
            document.getElementById('auth-email').value = '';
            document.getElementById('auth-password-login').value = '';
            document.querySelectorAll('.auth-error').forEach(el => el.classList.add('hidden'));
            showAuthStep('step-1');
            openModal(document.getElementById('auth-overlay'));
        });

        sidebar.addEventListener('logout-request', async () => {
            await sb.auth.signOut();
            currentUser = null;
            currentProfile = null;
            currentUserRole = 'public';
            syncSidebarComponent();
        });
    }

    function getSidebarComponent() {
        if (!sidebarComponent) {
            sidebarComponent = document.querySelector('sidebar-component');
        }
        return sidebarComponent;
    }

    function syncSidebarComponent() {
        const comp = getSidebarComponent();
        if (!comp || typeof comp.setUser !== 'function') return;
        if (currentUser) comp.setUser(currentUser, currentProfile);
        else comp.clearUser();
        comp.setTodayList([], []);
        comp.setEvents([]);
        updateNotificationDot();
        const nav = comp.shadowRoot?.getElementById('sidebar-nav');
        if (nav) nav.style.display = 'block';
        const todayList = comp.shadowRoot?.getElementById('sidebar-today-list');
        if (todayList) todayList.style.display = 'none';
    }

    async function updateNotificationDot() {
        const comp = getSidebarComponent();
        if (!comp) return;
        let hasNotifications = false;
        if (currentUser) {
            const { data } = await sb.from('notifications').select('id').eq('user_id', currentUser.id).eq('is_read', false).limit(1);
            if (data && data.length > 0) hasNotifications = true;
        }
        comp.setNotificationDot(hasNotifications);
    }

    /* :::::::::::::::::::::::::: DATABASE OPERATIONS :::::::::::::::::::::::::: */
    async function uploadProjectLogo(file, projectId) {
        const img = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = 150;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 150, 150);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.6));
        if (!blob) throw new Error('Failed to create WebP blob');
        const fileName = `${projectId}.webp`;
        const { error } = await sb.storage.from('logos').upload(fileName, blob, {
            cacheControl: '3600',
            upsert: true
        });
        if (error) throw error;
        const { data: publicURL } = sb.storage.from('logos').getPublicUrl(fileName);
        return publicURL.publicUrl;
    }

    async function deleteProjectLogo(projectId) {
        const fileName = `${projectId}.webp`;
        await sb.storage.from('logos').remove([fileName]);
    }

    async function loadProjects() {
        if (!currentUser) {
            projects = [];
            return;
        }

        const { data, error } = await sb
            .from('tempozio')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) {
            projects = [];
            return;
        }

        const now = Date.now();
        const updatedProjects = [];

        projects = data.map(p => {
            const history = p.history || [];
            let computedElapsed = history.reduce((sum, s) => sum + (s.duration || 0), 0);
            let newLastStart = p.last_start_time;
            let historyChanged = false;

            if (p.is_running && p.last_start_time) {
                const oldStart = p.last_start_time;
                let cursor = oldStart;
                while (cursor < now) {
                    const dayEnd = new Date(cursor);
                    dayEnd.setHours(24, 0, 0, 0);
                    const segmentEnd = Math.min(dayEnd.getTime(), now);
                    const duration = segmentEnd - cursor;
                    if (duration > 1000) {
                        history.push({
                            start: cursor,
                            end: segmentEnd,
                            duration: duration
                        });
                        computedElapsed += duration;
                    }
                    cursor = segmentEnd;
                }
                newLastStart = now;
                historyChanged = true;
            }

            if (p.elapsed !== computedElapsed || historyChanged) {
                updatedProjects.push({
                    id: p.id,
                    history: history,
                    elapsed: computedElapsed,
                    last_start_time: newLastStart
                });
            }

            return {
                ...p,
                subName: p.sub_name,
                history: history,
                elapsed: computedElapsed,
                lastStartTime: newLastStart,
                isRunning: p.is_running
            };
        });

        if (updatedProjects.length > 0) {
            const updatePromises = updatedProjects.map(up =>
                sb.from('tempozio').update({
                    history: up.history,
                    elapsed: up.elapsed,
                    last_start_time: up.last_start_time
                }).eq('id', up.id)
            );
            await Promise.allSettled(updatePromises).catch(console.error);
        }

        for (const p of projects) {
            if (p.isRunning && !p.lastStartTime) {
                p.lastStartTime = now;
                updateProjectInDB(p).catch(console.error);
            }
        }
    }

    async function addProjectToDB(project) {
        await sb.from('tempozio').insert({
            user_id: currentUser.id,
            name: project.name,
            sub_name: project.subName,
            category: project.category,
            color: project.color,
            logo: project.logo,
            elapsed: project.elapsed,
            is_running: project.isRunning,
            last_start_time: project.lastStartTime,
            history: project.history
        });
    }

    async function updateProjectInDB(project) {
        await sb.from('tempozio').update({
            name: project.name,
            sub_name: project.subName,
            category: project.category,
            color: project.color,
            logo: project.logo,
            elapsed: project.elapsed,
            is_running: project.isRunning,
            last_start_time: project.lastStartTime,
            history: project.history
        }).eq('id', project.id);
    }

    async function deleteProjectFromDB(id) {
        await sb.from('tempozio').delete().eq('id', id);
        await deleteProjectLogo(id).catch(() => {});
    }

    /* :::::::::::::::::::::::::: PROJECT MODAL :::::::::::::::::::::::::: */
    function openProjectModal(projectId) {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        currentModalProjectId = projectId;
        buildModalContent(project);
        openModal(elements.modalOverlay);
    }

    function buildModalContent(project) {
        const template = document.getElementById('project-detail-template');
        const clone = template.content.cloneNode(true);

        const logoContainer = clone.querySelector('.modal-logo-container');
        const logoUrl = project.logo && !project.logo.startsWith('data:') ? project.logo : '';
        if (logoUrl) {
            logoContainer.innerHTML = `
                <label for="edit-logo" class="modal-logo-wrapper">
                    <img src="${escapeHtml(logoUrl)}" class="modal-logo-img" alt="Logo">
                    <span class="modal-logo-overlay">
                        <svg class="modal-logo-pencil" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                        </svg>
                    </span>
                </label>
            `;
        } else {
            logoContainer.innerHTML = `
                <label for="edit-logo" class="modal-logo-wrapper">
                    <div class="modal-logo-fallback"><span class="modal-logo-letter">${project.name.charAt(0).toUpperCase()}</span></div>
                    <span class="modal-logo-overlay">
                        <svg class="modal-logo-pencil" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                        </svg>
                    </span>
                </label>
            `;
            const fallbackDiv = logoContainer.querySelector('.modal-logo-fallback');
            if (fallbackDiv) fallbackDiv.style.setProperty('--logo-bg', project.color);
        }

        clone.querySelector('.modal-title').textContent = project.name;
        clone.getElementById('edit-name').value = project.name;
        clone.getElementById('edit-color-hex').value = project.color;

        const existingCategories = project.category ? project.category.split(',').map(c => c.trim()).filter(Boolean) : [];

        clone.getElementById('modal-time').textContent = formatTime(getDisplayElapsed(project));

        const playBtn = clone.getElementById('modal-play-btn');
        playBtn.innerHTML = project.isRunning
            ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-size"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-size"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg>`;

        const historyBody = clone.getElementById('history-list');
        if (project.history.length) {
            const sortedHistory = [...project.history].sort((a, b) => b.start - a.start);
            historyBody.innerHTML = sortedHistory.map(h => {
                const dateStr = new Date(h.start).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                const timeStr = formatTimeOnly(h.start);
                const endTimeStr = formatTimeOnly(h.end);
                return `
                    <tr>
                        <td>
                            <span class="history-date">${dateStr}</span>
                            <span class="history-time">${timeStr}</span>
                        </td>
                        <td>${formatTime(h.duration)}</td>
                        <td>${timeStr} – ${endTimeStr}</td>
                    </tr>
                `;
            }).join('');
        } else {
            historyBody.innerHTML = '<tr><td colspan="3" class="no-sessions">No recorded sessions yet.</td></tr>';
        }

        elements.modalContent.innerHTML = '';
        elements.modalContent.appendChild(clone);

        initCategoryDropdown('edit-category-container', 'edit-category', existingCategories);

        const timeBox = document.querySelector('.project-time-box');
        if (timeBox) {
            const rgb = hexToRgb(project.color);
            timeBox.style.setProperty('--time-r', rgb.r);
            timeBox.style.setProperty('--time-g', rgb.g);
            timeBox.style.setProperty('--time-b', rgb.b);
        }

        document.getElementById('modal-close-btn').addEventListener('click', () => closeModal(elements.modalOverlay));
        document.getElementById('modal-play-btn').addEventListener('click', () => toggleTimer(project.id));
        document.getElementById('modal-save-btn').addEventListener('click', () => saveModalChanges(project));
        document.getElementById('modal-delete-btn').addEventListener('click', () => deleteProject(project.id));

        const editLogoInput = document.getElementById('edit-logo');
        if (editLogoInput) {
            editLogoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                editLogoInput.value = '';
                openCropperModal(file, (croppedFile) => {
                    editLogoFile = croppedFile;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const wrapper = document.querySelector('.modal-logo-wrapper');
                        if (!wrapper) return;
                        const existingImg = wrapper.querySelector('.modal-logo-img');
                        if (existingImg) {
                            existingImg.src = ev.target.result;
                        } else {
                            const fallback = wrapper.querySelector('.modal-logo-fallback');
                            if (fallback) {
                                fallback.remove();
                                const img = document.createElement('img');
                                img.src = ev.target.result;
                                img.className = 'modal-logo-img';
                                img.alt = 'Logo';
                                wrapper.insertBefore(img, wrapper.firstChild);
                            }
                        }
                    };
                    reader.readAsDataURL(croppedFile);
                });
            });
        }
    }

    async function saveModalChanges(project) {
        const name = document.getElementById('edit-name').value.trim();
        if (!name) { alert('Project name cannot be empty.'); return; }
        project.name = name;

        const categoryInput = document.getElementById('edit-category');
        project.category = categoryInput ? categoryInput.value.trim() : '';

        const hexInput = document.getElementById('edit-color-hex');
        if (hexInput) {
            project.color = hexInput.value.trim() || project.color;
        }

        if (editLogoFile) {
            try {
                if (project.logo) await deleteProjectLogo(project.id).catch(() => {});
                const newUrl = await uploadProjectLogo(editLogoFile, project.id);
                project.logo = newUrl;
            } catch (e) {
                console.error('Failed to update logo:', e);
            }
            editLogoFile = null;
        }

        showGlobalLoader();
        await updateProjectInDB(project);
        hideGlobalLoader();
        updateCategorySuggestions();
        render();
        refreshModalContent(project);
        closeModal(elements.modalOverlay);
    }

    function refreshModalContent(project) {
        const playBtn = document.getElementById('modal-play-btn');
        if (playBtn) {
            playBtn.innerHTML = project.isRunning
                ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-size"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="icon-size"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg>`;
        }
        const timeEl = document.getElementById('modal-time');
        if (timeEl) timeEl.textContent = formatTime(getDisplayElapsed(project));
    }

    function updateSingleCardUI(project) {
        const card = document.querySelector(`.project-card[data-id="${project.id}"]`);
        if (!card) return;

        card.classList.toggle('running', project.isRunning);

        let dot = card.querySelector('.neon-dot');
        if (project.isRunning) {
            if (!dot) {
                dot = document.createElement('div');
                dot.className = 'neon-dot blinking';
                card.prepend(dot);
            }
        } else {
            if (dot) dot.remove();
        }

        const timeEl = card.querySelector('.card-time');
        if (timeEl) {
            timeEl.textContent = formatTime(getDisplayElapsed(project));
        }

        const chartDiv = card.querySelector('.card-chart');
        if (chartDiv) {
            drawWeeklyChart(project, chartDiv);
        }
    }

    /* :::::::::::::::::::::::::: TIMER LOGIC :::::::::::::::::::::::::: */
    async function toggleTimer(id) {
        const project = projects.find(p => p.id === id);
        if (!project) return;

        const now = Date.now();

        if (project.isRunning) {
            const sessionDuration = now - project.lastStartTime;
            project.history.push({ start: project.lastStartTime, end: now, duration: sessionDuration });
            project.isRunning = false;
            project.lastStartTime = null;
            project.elapsed = project.history.reduce((sum, s) => sum + (s.duration || 0), 0);
        } else {
            for (const p of projects) {
                if (p.id !== id && p.isRunning) {
                    const sessionDuration = now - p.lastStartTime;
                    p.history.push({ start: p.lastStartTime, end: now, duration: sessionDuration });
                    p.elapsed = p.history.reduce((sum, s) => sum + (s.duration || 0), 0);
                    p.isRunning = false;
                    p.lastStartTime = null;
                    await updateProjectInDB(p);
                    updateSingleCardUI(p);
                }
            }
            project.isRunning = true;
            project.lastStartTime = now;
            project.elapsed = project.history.reduce((sum, s) => sum + (s.duration || 0), 0);
        }

        showGlobalLoader();
        await updateProjectInDB(project);
        hideGlobalLoader();

        updateSingleCardUI(project);

        if (currentModalProjectId === id) refreshModalContent(project);

        updateDashboard();
        updateWeeklyMiniProjects();
        updateSidebarProjects();
    }

    async function deleteProject(id) {
        if (confirm("Are you sure you want to delete this project?")) {
            showGlobalLoader();
            await deleteProjectFromDB(id);
            projects = projects.filter(p => p.id !== id);
            updateCategorySuggestions();
            closeModal(elements.modalOverlay);
            render();
            hideGlobalLoader();
        }
    }

    /* :::::::::::::::::::::::::: DASHBOARD & CHARTS :::::::::::::::::::::::::: */
    function getWeeklyDurations(project, offsetDays = 0) {
        const now = Date.now();
        const dayMs = 86400000;
        const today = new Date();
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
        const windowStart = todayStart - ((6 + offsetDays) * dayMs);
        const durations = new Array(7).fill(0);

        function addSessionToWindow(sessionStart, sessionEnd) {
            if (sessionEnd <= sessionStart) return;
            for (let i = 0; i < 7; i++) {
                const dayStart = windowStart + i * dayMs;
                const dayEnd = dayStart + dayMs;
                const overlapStart = Math.max(sessionStart, dayStart);
                const overlapEnd = Math.min(sessionEnd, dayEnd);
                if (overlapEnd > overlapStart) durations[i] += overlapEnd - overlapStart;
            }
        }

        project.history.forEach(s => addSessionToWindow(s.start, s.end));
        if (offsetDays === 0 && project.isRunning && project.lastStartTime) {
            addSessionToWindow(project.lastStartTime, now);
        }
        return durations;
    }

    function drawWeeklyChart(project, container) {
        if (!container) return;
        const durations = getWeeklyDurations(project);
        const totalDuration = durations.reduce((a, b) => a + b, 0);
        const hasData = totalDuration > 0;
        const max = Math.max(...durations, 1);
        const color = project.color || '#A7FF3D';

        let fillHTML = '';
        let pathHTML = '';

        if (hasData) {
            const pts = durations.map((val, i) => ({
                x: (i / 6) * 100,
                y: 45 - (val / max) * 35
            }));

            const tension = 0.0;
            let d = '';
            const n = pts.length;
            for (let i = 0; i < n - 1; i++) {
                const p0 = pts[i - 1] || pts[i];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[i + 2] || p2;
                const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
                const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
                const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
                const cp2y = p2.y - (p3.y - p1.y) * tension / 6;
                if (i === 0) d += `M ${p1.x},${p1.y} C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
                else d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
            }

            const firstX = pts[0].x, lastX = pts[n-1].x;
            const fillD = `${d} L ${lastX},50 L ${firstX},50 Z`;
            fillHTML = `<path d="${fillD}" fill="${color}" opacity="0.2" />`;
            pathHTML = `<path d="${d}" fill="none" stroke="${color}" stroke-width="0.7" opacity="0.55" stroke-linecap="round" stroke-linejoin="round" />`;
        }

        const verticalLines = durations.map((_, i) => {
            const x = (i / 6) * 100;
            return `<line x1="${x}" y1="0" x2="${x}" y2="50" stroke="white" stroke-width="0.5" opacity="0.015" />`;
        }).join('');

        const horizontalLines = [10, 20, 30, 40].map(y =>
            `<line x1="0" y1="${y}" x2="100" y2="${y}" stroke="white" stroke-width="0.5" opacity="0.015" />`
        ).join('');

        container.innerHTML = `
            <svg viewBox="0 0 100 50" preserveAspectRatio="none" width="100%" height="100%">
                ${verticalLines}
                ${horizontalLines}
                ${fillHTML}
                ${pathHTML}
            </svg>
        `;
    }

    function drawWeeklyOverviewChart() {
        const container = document.getElementById('weekly-chart-container');
        if (!container) return;

        const dailyTotalsThis = [0,0,0,0,0,0,0];
        projects.forEach(p => {
            const d = getWeeklyDurations(p, 0);
            d.forEach((val, i) => dailyTotalsThis[i] += val);
        });

        const dailyTotalsLast = [0,0,0,0,0,0,0];
        projects.forEach(p => {
            const d = getWeeklyDurations(p, 7);
            d.forEach((val, i) => dailyTotalsLast[i] += val);
        });

        const totalThisWeek = dailyTotalsThis.reduce((a,b)=>a+b, 0);
        const totalLastWeek = dailyTotalsLast.reduce((a,b)=>a+b, 0);

        const totalTimeEl = document.getElementById('weekly-total-time');
        if (totalTimeEl) totalTimeEl.textContent = formatTimeShort(totalThisWeek);

        const changeEl = document.getElementById('weekly-change');
        if (changeEl) {
            let percentChange = 0;
            if (totalLastWeek > 0) {
                percentChange = ((totalThisWeek - totalLastWeek) / totalLastWeek) * 100;
            } else if (totalThisWeek > 0) {
                percentChange = Infinity;
            }

            const absChange = Math.abs(Math.round(percentChange));
            const displayValue = isFinite(percentChange) ? `${absChange}%` : '—';

            let arrow = '';
            if (percentChange > 0) arrow = '▲';
            else if (percentChange < 0) arrow = '▼';

            changeEl.innerHTML = `<span class="weekly-change-arrow">${arrow}</span> <span class="weekly-change-value">${displayValue}</span> <span class="weekly-change-label">vs last week</span>`;

            changeEl.classList.remove('positive', 'negative');
            if (percentChange > 0) changeEl.classList.add('positive');
            else if (percentChange < 0) changeEl.classList.add('negative');
        }

        const maxDailyMs = Math.max(...dailyTotalsThis, 1);
        const maxHours = Math.ceil(maxDailyMs / 3600000);
        const chartMaxMs = maxHours * 3600000;
        const maxBarY = 85;

        let bars = '';
        const barLabelData = [];

        dailyTotalsThis.forEach((val, i) => {
            if (val > 0) {
                const heightPercent = (val / chartMaxMs) * maxBarY;
                const x = i * (100/7) + ((100/7) - (100/14)) / 2;
                const y = maxBarY - heightPercent;
                bars += `<rect x="${x}%" y="${y}%" width="${100/14}%" height="${heightPercent}%" fill="var(--accent)" opacity="0.7" rx="2" />`;
                const barCenter = (i + 0.5) * (100 / 7);
                barLabelData.push({
                    barCenterPercent: barCenter,
                    topPercent: y - 2,
                    time: formatTimeShort(val)
                });
            }
        });

        let guideLines = '';
        const hourLabels = [];
        for (let h = 1; h <= maxHours; h++) {
            const yPercent = maxBarY * (1 - h / maxHours);
            guideLines += `<line x1="0" y1="${yPercent}" x2="100" y2="${yPercent}" stroke="rgba(255,255,255,0.05)" stroke-width="0.5" />`;
            hourLabels.push({ label: h + 'h', yPercent });
        }

        const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const today = new Date();
        const labels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            labels.push(dayNames[d.getDay()]);
        }

        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-wrapper';
        wrapper.innerHTML = `
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
                ${guideLines}
                ${bars}
            </svg>
        `;

        hourLabels.forEach(item => {
            const span = document.createElement('span');
            span.className = 'chart-hour-label';
            span.textContent = item.label;
            span.style.top = item.yPercent + '%';
            wrapper.appendChild(span);
        });

        labels.forEach((label, i) => {
            const span = document.createElement('span');
            span.className = 'chart-day-label';
            span.textContent = label;
            const center = (i + 0.5) * (100 / 7);
            span.style.left = `calc(28px + ${center / 100} * (100% - 28px))`;
            wrapper.appendChild(span);
        });

        barLabelData.forEach(item => {
            const span = document.createElement('span');
            span.className = 'chart-bar-label';
            span.textContent = item.time;
            span.style.left = `calc(28px + ${item.barCenterPercent / 100} * (100% - 28px))`;
            span.style.top = item.topPercent + '%';
            wrapper.appendChild(span);
        });

        container.appendChild(wrapper);
    }

    function updateBreakdown() {
        const list = elements.breakdownList;
        if (!list) return;
        const totalElapsed = projects.reduce((sum, p) => sum + getDisplayElapsed(p), 0);
        const last5 = projects.slice(0, 5);
        last5.sort((a, b) => getDisplayElapsed(b) - getDisplayElapsed(a));
        let html = '';
        const circumference = 2 * Math.PI * 15;

        last5.forEach(p => {
            const elapsed = getDisplayElapsed(p);
            const percent = totalElapsed > 0 ? Math.round((elapsed / totalElapsed) * 100) : 0;
            const color = p.color || '#A7FF3D';
            const offset = circumference - (percent / 100) * circumference;

            html += `
                <div class="breakdown-item">
                    <svg class="progress-ring" viewBox="0 0 36 36">
                        <circle class="bg" cx="18" cy="18" r="15" />
                        <circle class="fill" cx="18" cy="18" r="15"
                            stroke="${color}"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}" />
                        <text x="18" y="18" dy="0.3em">${percent}%</text>
                    </svg>
                    <div class="breakdown-info">
                        <div class="breakdown-name">${escapeHtml(p.name)}</div>
                        <div class="breakdown-time">${formatTime(elapsed)}</div>
                    </div>
                </div>`;
        });

        if (last5.length === 0) {
            html = '<p style="font-size:14px; color:var(--muted); text-align:center;">No projects yet</p>';
        }
        list.innerHTML = html;
    }

    function updateDashboard() {
        drawWeeklyOverviewChart();
        updateBreakdown();
    }

    /* :::::::::::::::::::::::::: MINI PROJECTS (RECENT ACTIVITY) :::::::::::::::::::::::::: */
    function updateWeeklyMiniProjects() {
        const container = document.getElementById('weekly-mini-projects');
        if (!container) return;

        const projectsWithActivity = projects.map(p => {
            let lastActivity = 0;
            if (p.isRunning) {
                lastActivity = Date.now();
            } else if (p.history && p.history.length > 0) {
                lastActivity = Math.max(...p.history.map(h => h.start));
            } else if (p.created_at) {
                lastActivity = new Date(p.created_at).getTime();
            }
            return { ...p, lastActivity };
        });

        projectsWithActivity.sort((a, b) => b.lastActivity - a.lastActivity);
        const latestProjects = projectsWithActivity.slice(0, 4);

        if (!latestProjects.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = latestProjects.map(project => {
            const elapsed = getDisplayElapsed(project);
            const logoUrl = project.logo || '';
            const color = project.color || '#A7FF3D';

            const logoHTML = logoUrl
                ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" onerror="this.parentElement.classList.add('broken')">
                <span class="mini-logo-letter">${escapeHtml(project.name.charAt(0).toUpperCase())}</span>`
                : `<span class="mini-logo-letter">${escapeHtml(project.name.charAt(0).toUpperCase())}</span>`;

            const bgStyle = logoUrl ? '' : `style="background-color:${color};"`;
            const timeClass = project.isRunning ? 'mini-time active' : 'mini-time';

            return `
                <div class="mini-project-card" data-id="${project.id}">
                    <div class="mini-logo ${logoUrl ? 'has-logo' : ''}" ${bgStyle}>
                        ${logoHTML}
                    </div>
                    <div class="mini-info">
                        <span class="mini-name">${escapeHtml(project.name)}</span>
                        <span class="${timeClass}">${formatTime(elapsed)}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.mini-project-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                if (id) openProjectModal(id);
            });
        });
    }

    function updateMiniCardTimes() {
        const container = document.getElementById('weekly-mini-projects');
        if (!container) return;

        const miniCards = container.querySelectorAll('.mini-project-card');
        miniCards.forEach(card => {
            const id = card.dataset.id;
            if (!id) return;
            const project = projects.find(p => p.id === id);
            if (!project || !project.isRunning) return;

            const timeSpan = card.querySelector('.mini-time');
            if (timeSpan) {
                timeSpan.textContent = formatTime(getDisplayElapsed(project));
            }
        });
    }

    /* :::::::::::::::::::::::::: RENDERING & TICKER :::::::::::::::::::::::::: */
    function render() {
        if (!elements.emptyState || !elements.carousel || !elements.track) return;

        projects.forEach(p => {
            let lastActivity = 0;
            if (p.isRunning) {
                lastActivity = Date.now();
            } else if (p.history && p.history.length > 0) {
                lastActivity = Math.max(...p.history.map(h => h.start));
            } else {
                lastActivity = p.created_at ? new Date(p.created_at).getTime() : 0;
            }
            p._lastActivity = lastActivity;
        });

        projects.sort((a, b) => b._lastActivity - a._lastActivity);
        const visibleProjects = projects.slice(0, 4);

        if (projects.length === 0) {
            elements.emptyState.style.display = 'flex';
            elements.carousel.style.display = 'none';
            elements.track.innerHTML = '';
        } else {
            elements.emptyState.style.display = 'none';
            elements.carousel.style.display = 'block';
        }

        elements.track.innerHTML = '';

        visibleProjects.forEach(project => {
            const curr = getDisplayElapsed(project);
            const card = document.createElement('div');
            card.className = `project-card ${project.isRunning ? 'running' : ''}`;
            card.dataset.id = project.id;

            const color = project.color || '#A7FF3D';
            const rgb = hexToRgb(color);
            card.style.setProperty('--project-r', rgb.r);
            card.style.setProperty('--project-g', rgb.g);
            card.style.setProperty('--project-b', rgb.b);

            if (project.isRunning) {
                const dot = document.createElement('div');
                dot.className = 'neon-dot blinking';
                card.appendChild(dot);
            }

            const logoUrl = project.logo || '';
            let logoHTML;
            if (logoUrl) {
                logoHTML = `
                    <div class="project-logo has-image">
                        <img src="${escapeHtml(logoUrl)}" alt="Logo" onerror="this.parentElement.classList.add('broken')">
                        <span class="project-logo-letter">${project.name.charAt(0).toUpperCase()}</span>
                    </div>`;
            } else {
                logoHTML = `<div class="project-logo" style="--logo-bg:${color}">${project.name.charAt(0).toUpperCase()}</div>`;
            }

            const topDiv = document.createElement('div');
            topDiv.className = 'card-top';
            topDiv.innerHTML = logoHTML;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'card-name';
            nameSpan.title = project.name;
            nameSpan.textContent = project.name;
            topDiv.appendChild(nameSpan);

            if (project.category) {
                const cats = project.category.split(',').map(c => c.trim()).filter(Boolean);
                if (cats.length > 0) {
                    const catsContainer = document.createElement('div');
                    catsContainer.className = 'card-categories';
                    cats.forEach((cat, index) => {
                        const catSpan = document.createElement('span');
                        catSpan.className = 'card-category-inline';
                        catSpan.textContent = cat;
                        catsContainer.appendChild(catSpan);
                        if (index < cats.length - 1) {
                            const divider = document.createElement('span');
                            divider.className = 'category-divider';
                            divider.textContent = '|';
                            catsContainer.appendChild(divider);
                        }
                    });
                    topDiv.appendChild(catsContainer);
                }
            }

            card.appendChild(topDiv);

            const timeDiv = document.createElement('div');
            timeDiv.className = 'card-time';
            timeDiv.id = `time-${project.id}`;
            timeDiv.textContent = formatTime(curr);
            card.appendChild(timeDiv);

            const chartDiv = document.createElement('div');
            chartDiv.className = 'card-chart';
            chartDiv.id = `chart-${project.id}`;
            card.appendChild(chartDiv);

            const bottomDiv = document.createElement('div');
            bottomDiv.className = 'card-bottom';
            card.appendChild(bottomDiv);

            elements.track.appendChild(card);
            drawWeeklyChart(project, chartDiv);
        });

        if (elements.arrowLeft) elements.arrowLeft.classList.add('hidden');
        if (elements.arrowRight) elements.arrowRight.classList.add('hidden');

        updateCategorySuggestions();
        updateDashboard();
        updateWeeklyMiniProjects();
        updateSidebarProjects();
    }

    function startTicker() {
        if (tickerInterval) clearInterval(tickerInterval);
        tickerInterval = setInterval(updateRunningTimers, 1000);

        if (window.syncInterval) clearInterval(window.syncInterval);
        window.syncInterval = setInterval(syncRunningProjectsFromServer, 10000);
    }

    function updateRunningTimers() {
        projects.forEach(p => {
            if (p.isRunning) {
                const el = document.getElementById(`time-${p.id}`);
                if (el) el.textContent = formatTime(getDisplayElapsed(p));
            }
        });
        updateDashboard();
        updateMiniCardTimes();
        if (currentModalProjectId) {
            const project = projects.find(p => p.id === currentModalProjectId);
            if (project) {
                const modalTimeEl = document.getElementById('modal-time');
                if (modalTimeEl) modalTimeEl.textContent = formatTime(getDisplayElapsed(project));
            }
        }
    }

    function updateArrowVisibility() {
        const carousel = elements.carousel;
        if (!carousel || projects.length <= 4) {
            if (elements.arrowLeft) elements.arrowLeft.classList.add('hidden');
            if (elements.arrowRight) elements.arrowRight.classList.add('hidden');
            return;
        }
        const sl = carousel.scrollLeft;
        const max = carousel.scrollWidth - carousel.clientWidth;
        if (elements.arrowLeft) elements.arrowLeft.classList.toggle('hidden', sl <= 1);
        if (elements.arrowRight) elements.arrowRight.classList.toggle('hidden', sl >= max - 1);
    }

    function updateCategorySuggestions() {
        const categories = [...new Set(projects.flatMap(p => {
            if (p.category) return p.category.split(',').map(c => c.trim()).filter(Boolean);
            return [];
        }))];
        const datalist = document.getElementById('category-list');
        if (!datalist) return;
        datalist.innerHTML = '';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            datalist.appendChild(option);
        });
    }

    function updateSidebarProjects() {
        const list = document.getElementById('sidebar-projects-list');
        if (!list) return;

        if (!projects.length) {
            list.innerHTML = '';
            return;
        }

        list.innerHTML = projects.map(project => {
            const color = project.color || '#A7FF3D';
            return `
                <button class="sidebar-project-item" data-id="${project.id}">
                    <span class="sidebar-project-dot" style="background-color:${color};"></span>
                    <span class="sidebar-project-name">${escapeHtml(project.name)}</span>
                </button>
            `;
        }).join('');

        list.querySelectorAll('.sidebar-project-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.dataset.id;
                if (id) {
                    openProjectModal(id);
                    const comp = getSidebarComponent();
                    if (comp && comp.closeSidebar) comp.closeSidebar();
                }
            });
        });
    }

    /* :::::::::::::::::::::::::: NEW PROJECT MODAL :::::::::::::::::::::::::: */
    function openNewProjectModal() {
        document.getElementById('new-project-name').value = '';
        document.getElementById('new-project-color').value = '#A7FF3D';
        const colorPreview = document.getElementById('new-color-preview');
        if (colorPreview) colorPreview.style.backgroundColor = '#A7FF3D';
        document.getElementById('new-logo-preview').src = '';
        document.getElementById('new-logo-preview').classList.add('hidden');
        document.getElementById('project-name-preview').textContent = 'New Project';
        document.getElementById('project-category-preview').textContent = '';
        const logoLetter = document.getElementById('logo-letter');
        if (logoLetter) {
            logoLetter.textContent = '';
            logoLetter.classList.add('hidden');
            document.getElementById('logo-upload-square').classList.remove('has-content');
        }
        newProjectLogoFile = null;

        initCategoryDropdown('new-project-category-container', 'new-project-category', []);

        openModal(document.getElementById('new-project-modal'));
    }

    async function handleAddProjectFromModal() {
        const name = document.getElementById('new-project-name').value.trim();
        if (!name) { alert('Project name cannot be empty.'); return; }

        const colorValue = document.getElementById('new-project-color').value.trim();
        const hexColor = /^#[0-9A-Fa-f]{6}$/.test(colorValue) ? colorValue : '#A7FF3D';
        const projectId = generateId();
        let logoUrl = null;

        if (newProjectLogoFile) {
            try {
                logoUrl = await uploadProjectLogo(newProjectLogoFile, projectId);
            } catch (e) {
                console.error('Logo upload failed:', e);
            }
        }

        const category = document.getElementById('new-project-category').value.trim();

        const newProject = {
            id: projectId,
            name: name,
            subName: '',
            category: category,
            color: hexColor,
            logo: logoUrl || '',
            elapsed: 0,
            isRunning: false,
            lastStartTime: null,
            history: []
        };

        showGlobalLoader();
        await addProjectToDB(newProject);
        projects.unshift(newProject);
        updateCategorySuggestions();
        render();
        hideGlobalLoader();

        closeModal(document.getElementById('new-project-modal'));
        newProjectLogoFile = null;
    }

    /* :::::::::::::::::::::::::: EVENT BINDING & INITIALIZATION :::::::::::::::::::::::::: */
    function bindTempozioEvents() {
        if (elements.track) {
            elements.track.addEventListener('click', (e) => {
                const card = e.target.closest('.project-card');
                if (!card) return;
                if (e.target.closest('.project-logo')) {
                    toggleTimer(card.dataset.id);
                } else {
                    openProjectModal(card.dataset.id);
                }
            });
        }
        if (elements.arrowLeft) elements.arrowLeft.addEventListener('click', () => elements.carousel.scrollBy({ left: -elements.carousel.clientWidth, behavior: 'smooth' }));
        if (elements.arrowRight) elements.arrowRight.addEventListener('click', () => elements.carousel.scrollBy({ left: elements.carousel.clientWidth, behavior: 'smooth' }));
        if (elements.carousel) elements.carousel.addEventListener('scroll', updateArrowVisibility);
        window.addEventListener('resize', updateArrowVisibility);
        if (elements.modalOverlay) {
            elements.modalOverlay.addEventListener('click', (e) => {
                if (e.target === elements.modalOverlay) closeModal(elements.modalOverlay);
            });
        }

        const sidebarNewProjectBtn = document.getElementById('sidebar-new-project-btn');
        if (sidebarNewProjectBtn) {
            sidebarNewProjectBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openNewProjectModal();
                const comp = getSidebarComponent();
                if (comp && comp.closeSidebar) comp.closeSidebar();
            });
        }

        const addFromModalBtn = document.getElementById('add-project-from-modal-btn');
        if (addFromModalBtn) addFromModalBtn.addEventListener('click', handleAddProjectFromModal);

        const newProjectColorInput = document.getElementById('new-project-color');
        if (newProjectColorInput) {
            newProjectColorInput.addEventListener('input', () => {
                let hex = newProjectColorInput.value.trim();
                if (hex.charAt(0) !== '#') hex = '#' + hex;
                const preview = document.getElementById('new-color-preview');
                if (preview && /^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    preview.style.backgroundColor = hex;
                }
            });
        }

        const newProjectNameInput = document.getElementById('new-project-name');
        const projectNamePreview = document.getElementById('project-name-preview');
        const logoLetter = document.getElementById('logo-letter');
        const logoSquare = document.getElementById('logo-upload-square');

        if (newProjectNameInput && projectNamePreview) {
            newProjectNameInput.addEventListener('input', () => {
                const value = newProjectNameInput.value.trim();
                projectNamePreview.textContent = value || 'New Project';
                if (logoLetter) {
                    if (value) {
                        logoLetter.textContent = value.charAt(0).toUpperCase();
                        logoLetter.classList.remove('hidden');
                        logoSquare.classList.add('has-content');
                    } else {
                        logoLetter.textContent = '';
                        logoLetter.classList.add('hidden');
                        logoSquare.classList.remove('has-content');
                    }
                }
            });
        }

        const newProjectLogoInput = document.getElementById('new-project-logo');
        if (newProjectLogoInput) {
            newProjectLogoInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                newProjectLogoInput.value = '';
                openCropperModal(file, (croppedFile) => {
                    newProjectLogoFile = croppedFile;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const preview = document.getElementById('new-logo-preview');
                        if (preview) {
                            preview.src = ev.target.result;
                            preview.classList.remove('hidden');
                        }
                        const logoLetter = document.getElementById('logo-letter');
                        const logoSquare = document.getElementById('logo-upload-square');
                        if (logoLetter) logoLetter.classList.add('hidden');
                        if (logoSquare) logoSquare.classList.add('has-content');
                    };
                    reader.readAsDataURL(croppedFile);
                });
            });
        }
    }

    async function initTempozio() {
        if (tempozioInitDone) return;
        tempozioInitDone = true;
        await loadProjects();
        render();
        startTicker();
        bindTempozioEvents();
        hideGlobalLoader();
        elements.appContainer.classList.remove('app-hidden');
    }

    /* :::::::::::::::::::::::::: SYNC & UNLOAD :::::::::::::::::::::::::: */
    document.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal && e.target === modal) closeModal(modal);
    });
    document.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.close-modal');
        if (closeBtn) {
            const modal = closeBtn.closest('.modal');
            if (modal) closeModal(modal);
        }
    });

    async function saveRunningSessionsBeforeUnload() {
        const runningProjects = projects.filter(p => p.isRunning && p.lastStartTime);
        if (runningProjects.length === 0) return;

        const now = Date.now();
        for (const p of runningProjects) {
            const duration = now - p.lastStartTime;
            p.history.push({ start: p.lastStartTime, end: now, duration });
            p.elapsed += duration;
            p.lastStartTime = now;

            const body = JSON.stringify({
                history: p.history,
                elapsed: p.elapsed,
                last_start_time: now
            });

            const blob = new Blob([body], { type: 'application/json' });
            navigator.sendBeacon(
                `https://vzqicidepdmraygulrey.supabase.co/rest/v1/tempozio?id=eq.${p.id}`,
                blob
            );
        }
    }

    window.addEventListener('beforeunload', (event) => {
        saveRunningSessionsBeforeUnload();
    });

    async function syncRunningProjectsFromServer() {
        if (!currentUser) return;
        const runningLocal = projects.filter(p => p.isRunning);
        if (runningLocal.length === 0) return;

        const { data, error } = await sb
            .from('tempozio')
            .select('id, is_running, last_start_time, history, elapsed')
            .in('id', runningLocal.map(p => p.id));

        if (error || !data) return;

        data.forEach(remote => {
            const local = projects.find(p => p.id === remote.id);
            if (!local) return;

            if (!remote.is_running && local.isRunning) {
                if (local.lastStartTime) {
                    const duration = Date.now() - local.lastStartTime;
                    const alreadySaved = remote.history.some(s => s.start === local.lastStartTime);
                    if (!alreadySaved && duration > 0) {
                        local.history.push({ start: local.lastStartTime, end: Date.now(), duration });
                        local.elapsed += duration;
                    }
                }
                local.isRunning = false;
                local.lastStartTime = null;
                render();
            }
        });
    }

    /* :::::::::::::::::::::::::: STARTUP :::::::::::::::::::::::::: */
    document.addEventListener('DOMContentLoaded', async () => {
        setupAuthListeners();
        initSidebarListeners();
        await authRestoreSession();
        await initTempozio();
        setupCropListeners();
        customElements.whenDefined('sidebar-component').then(() => {
            getSidebarComponent();
            syncSidebarComponent();
        });
    });

})();