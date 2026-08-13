
        function escapeHtml(str) {
            return String(str == null ? '' : str).replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        var users = [];
        var usersRef = db.ref('admin_control/users');
        var usersListener = null;

        function switchPage(pageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.t-nav').forEach(n => n.classList.remove('active'));
            document.getElementById('page-' + pageId).classList.add('active');
            var navItems = document.querySelectorAll('.t-nav');
            for (var i = 0; i < navItems.length; i++) {
                if (navItems[i].getAttribute('onclick') && navItems[i].getAttribute('onclick').includes(pageId)) {
                    navItems[i].classList.add('active');
                    break;
                }
            }
            document.getElementById('mobileNav').classList.remove('show');
            if (pageId === 'settings') { renderUsers(); }
            if (pageId === 'manage-apps') { loadAppsList(); }
            if (pageId === 'support') { loadSupportSettings(); loadTickets(); }
            if (pageId === 'announcements') { renderAdminNotifs(); }
        }

        function switchPageMobile(pageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.m-nav').forEach(n => n.classList.remove('active'));
            document.getElementById('page-' + pageId).classList.add('active');
            var mNavs = document.querySelectorAll('.m-nav');
            for (var i = 0; i < mNavs.length; i++) {
                if (mNavs[i].getAttribute('onclick') && mNavs[i].getAttribute('onclick').includes(pageId)) {
                    mNavs[i].classList.add('active');
                    break;
                }
            }
            document.getElementById('mobileNav').classList.remove('show');
            if (pageId === 'settings') { renderUsers(); }
            if (pageId === 'manage-apps') { loadAppsList(); }
            if (pageId === 'support') { loadSupportSettings(); loadTickets(); }
            if (pageId === 'announcements') { renderAdminNotifs(); }
        }

        function toggleMobileNav() {
            document.getElementById('mobileNav').classList.toggle('show');
        }

        function saveRemember() {
            if (document.getElementById('rememberMe').checked) {
                localStorage.setItem('adminRemembered', JSON.stringify({ email: document.getElementById('loginEmail').value.trim(), pass: document.getElementById('loginPass').value }));
            } else { localStorage.removeItem('adminRemembered'); }
        }

        function loadRemember() {
            var saved = localStorage.getItem('adminRemembered');
            if (saved) { try { var d = JSON.parse(saved); document.getElementById('loginEmail').value = d.email || ''; document.getElementById('loginPass').value = d.pass || ''; document.getElementById('rememberMe').checked = true; } catch(e) {} }
        }

        function adminLogin() {
            var email = document.getElementById('loginEmail').value.trim();
            var pass = document.getElementById('loginPass').value;
            var err = document.getElementById('loginError');
            err.style.display = 'none';
            if (!email || !pass) { err.textContent = 'Enter email and password!'; err.style.display = 'block'; return; }
            saveRemember();
            auth.signInWithEmailAndPassword(email, pass).then(function(cred) {
                document.getElementById('loginOverlay').classList.add('hidden');
                loadAdminInfo(cred.user);
                loadDashboard();
            }).catch(function(error) { err.textContent = error.message; err.style.display = 'block'; });
        }

        auth.onAuthStateChanged(function(user) {
            if (user) {
                var stored = localStorage.getItem('adminSessionTime');
                var now = Date.now();
                if (!stored) {
                    localStorage.setItem('adminSessionTime', String(now));
                } else if (now - parseInt(stored, 10) >= 24 * 60 * 60 * 1000) {
                    localStorage.removeItem('adminSessionTime');
                    auth.signOut();
                    return;
                }
                document.getElementById('loginOverlay').classList.add('hidden');
                loadAdminInfo(user);
                loadDashboard();
                startUsersListener();
            }
            else {
                localStorage.removeItem('adminSessionTime');
                document.getElementById('loginOverlay').classList.remove('hidden');
                loadRemember();
                if (usersListener) { usersRef.off('value', usersListener); usersListener = null; }
            }
        });

        setInterval(function() {
            var stored = localStorage.getItem('adminSessionTime');
            if (stored && Date.now() - parseInt(stored, 10) >= 24 * 60 * 60 * 1000) {
                localStorage.removeItem('adminSessionTime');
                auth.signOut();
            }
        }, 60000);

        function loadAdminInfo(user) {
            var name = user.email ? user.email.split('@')[0] : 'Admin';
            document.getElementById('sidebarName').textContent = name;
            document.getElementById('sidebarEmail').textContent = user.email;
            document.getElementById('adminAvatar').textContent = name.charAt(0).toUpperCase();
            document.getElementById('infoEmail').textContent = user.email;
            document.getElementById('infoUid').textContent = user.uid;
        }

        function loadDashboard() {
            document.getElementById('updateTime').textContent = new Date().toLocaleTimeString('en-IN');
            db.ref('app_control/apps').once('value', function(snapshot) {
                var total = 0, active = 0, expired = 0, now = Date.now();
                snapshot.forEach(function(child) {
                    var data = child.val(); total++;
                    (data.status === 'Expired' || (data.expiryTime > 0 && now > data.expiryTime)) ? expired++ : active++;
                });
                document.getElementById('statTotal').textContent = total;
                document.getElementById('statActive').textContent = active;
                document.getElementById('statExpired').textContent = expired;
                document.getElementById('navTotal').textContent = total;
                document.getElementById('mNavTotal').textContent = total;
                loadAppsList();
            });
        }

        function loadAppsList() {
            appsCache = null;
            var container = document.getElementById('appListContainer');
            db.ref('app_control/apps').orderByChild('timestamp').once('value', function(snapshot) {
                var apps = [];
                snapshot.forEach(function(child) { var data = child.val(); data.code = child.key; apps.push(data); });
                apps.reverse();
                if (apps.length === 0) { container.innerHTML = '<li style="text-align:center;color:#555;padding:30px;"><i class="fas fa-inbox" style="margin-right:8px;"></i> No apps found.</li>'; return; }
                var html = '', now = Date.now();
                apps.forEach(function(app) {
                    var expired = (app.status === 'Expired' || (app.expiryTime > 0 && now > app.expiryTime));
                    var badge = expired ? 'b-expired' : 'b-active';
                    var status = expired ? 'Expired' : 'Active';
                    var expText = app.expiryTime > 0 ? new Date(app.expiryTime).toLocaleString('en-IN') : 'No limit';
                    var ownerTxt = app.owner ? ' &middot; Owner: ' + app.owner : '';
                    var statusBtn = expired
                        ? '<button class="btn-sm" onclick="setAppStatus(\'' + app.code + '\',\'Active\')" style="background:rgba(0,230,118,0.15);color:#00E676;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="Set Active"><i class="fas fa-check"></i></button>'
                        : '<button class="btn-sm" onclick="setAppStatus(\'' + app.code + '\',\'Expired\')" style="background:rgba(255,76,76,0.15);color:#FF4C4C;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="Set Expired"><i class="fas fa-ban"></i></button>';
                    html += '<li class="app-item"><div class="app-info"><h4>' + app.name + ' <span class="badge ' + badge + '">' + status + '</span></h4><p>' + app.code + ' &middot; Expiry: ' + expText + ownerTxt + '</p></div><div class="app-controls" style="display:flex;gap:6px;">' +
                        statusBtn +
                        '<button class="btn-sm" onclick="viewAppCode(\'' + app.code + '\')" style="background:rgba(52,152,219,0.15);color:#3498db;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="View Code"><i class="fas fa-code"></i></button>' +
                        '<button class="btn-sm" onclick="deleteApp(\'' + app.code + '\')" style="background:rgba(255,76,76,0.15);color:#FF4C4C;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="Delete"><i class="fas fa-trash"></i></button></div></li>';
                });
                container.innerHTML = html;
            });
        }

        function setAppStatus(code, status) {
            appsCache = null;
            db.ref('app_control/apps/' + code).update({ status: status }).then(function() {
                showToast('App set to ' + status + '!');
                loadDashboard();
            });
        }

        function deleteApp(code) {
            appsCache = null;
            if (!confirm('Delete this app?')) return;
            db.ref('app_control/apps/' + code).remove().then(function() {
                showToast('App deleted!');
                loadDashboard();
            });
        }

        function viewAppCode(code) {
            db.ref('app_control/apps/' + code + '/javacode').once('value', function(snapshot) {
                var codeData = snapshot.val();
                if (codeData) {
                    document.getElementById('appCodeText').textContent = codeData;
                    document.getElementById('appCodeModal').classList.add('show');
                } else { showToast('No code found for this app!'); }
            });
        }

        function copyAppCode() {
            var text = document.getElementById('appCodeText').textContent;
            if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(function() { showToast('Code copied!'); }); }
            else {
                var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
                try { document.execCommand('copy'); } catch(e) {}
                document.body.removeChild(ta); showToast('Code copied!');
            }
        }

        // --- SUPPORT & TICKETS (ADMIN) ---
        var ticketsListener = null;

        function esc(str) {
            return String(str == null ? '' : str).replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }

        function loadSupportSettings() {
            db.ref('support_config').once('value', function(snap) {
                var c = snap.val() || {};
                document.getElementById('supDevNameInput').value = c.devName || 'PRINCE HACKS';
                document.getElementById('supWaInput').value = c.whatsapp || '';
                document.getElementById('supTgInput').value = c.telegram || '';
            });
        }

        function saveSupportSettings() {
            var dev = document.getElementById('supDevNameInput').value.trim() || 'PRINCE HACKS';
            var wa = document.getElementById('supWaInput').value.trim();
            var tg = document.getElementById('supTgInput').value.trim();
            db.ref('support_config').set({ devName: dev, whatsapp: wa, telegram: tg }).then(function() {
                showToast('Support settings saved!');
            });
        }

        function loadTickets() {
            if (ticketsListener) { db.ref('support_tickets').off('value', ticketsListener); ticketsListener = null; }
            var container = document.getElementById('ticketsListContainer');
            ticketsListener = db.ref('support_tickets').orderByChild('timestamp').on('value', function(snapshot) {
                var tickets = [];
                snapshot.forEach(function(child) { var t = child.val(); t._key = child.key; tickets.push(t); });
                tickets.reverse();
                document.getElementById('ticketCount').textContent = '(' + tickets.length + ')';
                if (tickets.length === 0) { container.innerHTML = '<li style="text-align:center;color:#555;padding:30px;"><i class="fas fa-inbox" style="margin-right:8px;"></i> No tickets yet.</li>'; return; }
                var html = '';
                tickets.forEach(function(t) {
                    var statusBadge = t.status === 'resolved' ? '<span class="badge b-active">RESOLVED</span>' : '<span class="badge b-expired">OPEN</span>';
                    html += '<li class="app-item" style="flex-direction:column;align-items:stretch;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;"><h4>' + esc(t.subject) + ' ' + statusBadge + '</h4><div style="display:flex;gap:6px;">' +
                        (t.status === 'resolved'
                            ? '<button class="btn-sm" onclick="setTicketStatus(\'' + t._key + '\',\'open\')" style="background:rgba(255,179,0,0.15);color:#FFB300;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;"><i class="fas fa-redo"></i> Reopen</button>'
                            : '<button class="btn-sm" onclick="setTicketStatus(\'' + t._key + '\',\'resolved\')" style="background:rgba(0,230,118,0.15);color:#00E676;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;"><i class="fas fa-check"></i> Resolve</button>') +
                        '<button class="btn-sm" onclick="deleteTicket(\'' + t._key + '\')" style="background:rgba(255,76,76,0.15);color:#FF4C4C;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="Delete Ticket"><i class="fas fa-trash"></i></button>' +
                        '</div></div>' +
                        '<p style="font-size:11px;color:#888;margin-top:2px;">From: <b style="color:#C792EA;">' + esc(t.user) + '</b> &middot; ' + new Date(t.timestamp).toLocaleString('en-IN') + '</p>' +
                        '<p style="font-size:13px;color:#ddd;margin-top:6px;background:rgba(11,5,20,0.5);padding:10px;border-radius:10px;">' + esc(t.message) + '</p>';
                    var replies = t.replies || {};
                    var keys = Object.keys(replies).sort();
                    if (keys.length > 0) {
                        html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(179,102,255,0.08);">';
                        keys.forEach(function(k) {
                            var r = replies[k];
                            var who = r.from === 'admin' ? 'Admin' : t.user;
                            var color = r.from === 'admin' ? '#00E676' : '#C792EA';
                            html += '<div style="font-size:12px;margin-bottom:5px;color:' + color + ';"><b>' + who + ':</b> ' + esc(r.text) + '</div>';
                        });
                        html += '</div>';
                    }
                    html += '<div style="display:flex;gap:8px;margin-top:10px;">' +
                        '<input type="text" id="ticketReply_' + t._key + '" placeholder="Type reply..." style="flex:1;background:rgba(11,5,20,0.5);border:1px solid rgba(179,102,255,0.15);border-radius:8px;padding:10px;color:#fff;padding-left:15px;" onkeydown="if(event.key===\'Enter\'){sendAdminReply(\'' + t._key + '\')}">' +
                        '<button class="btn-sm" onclick="sendAdminReply(\'' + t._key + '\')" style="background:rgba(179,102,255,0.15);color:#B366FF;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;"><i class="fas fa-reply"></i> Reply</button></div></li>';
                });
                container.innerHTML = html;
            });
        }

        function sendAdminReply(key) {
            var inp = document.getElementById('ticketReply_' + key);
            if (!inp) return;
            var text = inp.value.trim();
            if (!text) { showToast('Type a reply first!'); return; }
            db.ref('support_tickets/' + key).once('value', function(snap) {
                var t = snap.val() || {};
                db.ref('support_tickets/' + key + '/replies/' + Date.now()).set({ from: 'admin', text: text, time: Date.now() }).then(function() {
                    if (t.user) {
                        db.ref('notifications').push({
                            text: 'Admin replied to your ticket: "' + (t.subject || 'Your Ticket') + '"',
                            time: Date.now(),
                            from: 'ADMIN',
                            target: 'user',
                            user: t.user
                        });
                    }
                    showToast('Reply sent to user!');
                });
            });
        }

        function setTicketStatus(key, status) {
            db.ref('support_tickets/' + key).update({ status: status }).then(function() {
                showToast('Ticket ' + status + '!');
            });
        }

        function deleteTicket(key) {
            if (!confirm('Delete this ticket permanently?')) return;
            db.ref('support_tickets/' + key).remove().then(function() {
                showToast('Ticket deleted!');
            });
        }

        // --- USER MANAGEMENT (Firebase) ---
        function startUsersListener() {
            usersListener = usersRef.on('value', function(snapshot) {
                users = [];
                snapshot.forEach(function(child) {
                    var user = child.val();
                    user._key = child.key;
                    users.push(user);
                });
                // If settings page is active, re-render
                var settingsPage = document.getElementById('page-settings');
                if (settingsPage && settingsPage.classList.contains('active')) renderUsers();
                var detailsPage = document.getElementById('page-user-details');
                if (detailsPage && detailsPage.classList.contains('active') && currentDetailUserKey) renderUserDetails();
            });
        }

        function renderUsers() {
            var container = document.getElementById('userListContainer');
            document.getElementById('userCount').textContent = '(' + users.length + ')';
            if (users.length === 0) { container.innerHTML = '<li style="text-align:center;color:#555;padding:30px;"><i class="fas fa-users" style="margin-right:8px;"></i> No users added yet.</li>'; return; }
            var html = '';
            users.forEach(function(user, i) {
                var lockedCount = user.lockedDevices ? user.lockedDevices.length : 0;
                var limitTxt = user.deviceLimit > 0 ? user.deviceLimit + ' Device' + (user.deviceLimit > 1 ? 's' : '') : 'Unlimited';
                var p = user.profile || {};
                var profParts = [];
                if (p.name) profParts.push('<b>Name:</b> ' + escapeHtml(p.name));
                if (p.contact) profParts.push('<b>Contact:</b> ' + escapeHtml(p.contact));
                if (p.youtube) profParts.push('<b>YouTube:</b> ' + escapeHtml(p.youtube));
                if (p.telegram) profParts.push('<b>Telegram:</b> ' + escapeHtml(p.telegram));
                var statusDot = user.online ? '<span style="color:#00E676;margin-right:4px;" title="Online">&#9679;</span>' : '<span style="color:#777;margin-right:4px;" title="Offline">&#9675;</span>';
                html += '<li class="app-item"><div class="app-info"><h4>' + statusDot + user.username + ' <span class="badge b-active">Active</span></h4><p>Pass: ' + user.password + ' &middot; ' + (user.device || 'No details') + ' &middot; Limit: ' + limitTxt + (lockedCount > 0 ? ' &middot; <span style="color:#FFB300;">' + lockedCount + ' device(s) locked</span>' : '') + '</p><div style="font-size:11px;color:#AAA;margin-top:4px;">' + (profParts.length ? profParts.join(' &middot; ') : '<span style="color:#777;">No profile details</span>') + '</div></div><div class="app-controls" style="display:flex;gap:6px;">' +
                    '<button class="btn-sm" onclick="showUserDetails(\'' + user._key + '\')" style="background:rgba(0,210,255,0.15);color:#00D2FF;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="View Details"><i class="fas fa-eye"></i></button>' +
                    (lockedCount > 0 ? '<button class="btn-sm" onclick="resetDevice(\'' + user._key + '\')" style="background:rgba(255,179,0,0.15);color:#FFB300;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="Reset Device"><i class="fas fa-unlock"></i></button>' : '') +
                    '<button class="btn-sm" onclick="editUser(\'' + user._key + '\')" style="background:rgba(255,179,0,0.15);color:#FFB300;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;"><i class="fas fa-pen"></i></button>' +
                    '<button class="btn-sm" onclick="deleteUser(\'' + user._key + '\')" style="background:rgba(255,76,76,0.15);color:#FF4C4C;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;"><i class="fas fa-trash"></i></button></div></li>';
            });
            container.innerHTML = html;
        }

        var currentDetailUserKey = null;
        var appsCache = null;

        function timeAgo(ms) {
            var diff = Date.now() - ms;
            if (diff < 0) return 'just now';
            if (diff < 60000) return Math.floor(diff / 1000) + ' sec ago';
            if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
            if (diff < 86400000) return Math.floor(diff / 3600000) + ' hr ago';
            return Math.floor(diff / 86400000) + ' days ago';
        }

        function presenceHtml(user) {
            if (user.online) return '<span style="color:#00E676;font-weight:700;">&#9679; ONLINE</span>';
            var last = user.lastSeen ? timeAgo(user.lastSeen) : 'never';
            return '<span style="color:#888;">&#9675; OFFLINE</span> <span style="color:#FFB300;">(last seen ' + last + ')</span>';
        }

        function showUserDetails(key) {
            currentDetailUserKey = key;
            switchPage('user-details');
            renderUserDetails();
        }

        function backToUsers() {
            switchPage('settings');
        }

        function renderUserDetails() {
            var user = null;
            for (var i = 0; i < users.length; i++) { if (users[i]._key === currentDetailUserKey) { user = users[i]; break; } }
            var accBox = document.getElementById('udAccountInfo');
            if (!user || !accBox) return;
            var lockedCount = user.lockedDevices ? user.lockedDevices.length : 0;
            var limitTxt = user.deviceLimit > 0 ? user.deviceLimit + ' Device(s)' : 'Unlimited';
            accBox.innerHTML =
                '<div class="form-group" style="margin:0;"><label>Status</label><div>' + presenceHtml(user) + '</div></div>' +
                '<div class="form-group" style="margin:0;"><label>Username</label><div>' + escapeHtml(user.username) + '</div></div>' +
                '<div class="form-group" style="margin:0;"><label>Password</label><div>' + escapeHtml(user.password || '—') + '</div></div>' +
                '<div class="form-group" style="margin:0;"><label>Device / Details</label><div>' + escapeHtml(user.device || '—') + '</div></div>' +
                '<div class="form-group" style="margin:0;"><label>Device Limit</label><div>' + limitTxt + '</div></div>' +
                '<div class="form-group" style="margin:0;"><label>Locked Devices</label><div>' + lockedCount + '</div></div>' +
                '<div class="form-group" style="margin:0;"><label>Created</label><div>' + (user.created ? new Date(user.created).toLocaleString('en-IN') : '—') + '</div></div>';
            var p = user.profile || {};
            var profHtml = '';
            if (!p.name && !p.contact && !p.youtube && !p.telegram) {
                profHtml = '<div style="color:#777;grid-column:1/-1;">No profile details added.</div>';
            } else {
                if (p.name) profHtml += '<div class="form-group" style="margin:0;"><label>Name</label><div>' + escapeHtml(p.name) + '</div></div>';
                if (p.contact) profHtml += '<div class="form-group" style="margin:0;"><label>Contact</label><div>' + escapeHtml(p.contact) + '</div></div>';
                if (p.youtube) profHtml += '<div class="form-group" style="margin:0;"><label>YouTube</label><div>' + escapeHtml(p.youtube) + '</div></div>';
                if (p.telegram) profHtml += '<div class="form-group" style="margin:0;"><label>Telegram</label><div>' + escapeHtml(p.telegram) + '</div></div>';
            }
            document.getElementById('udProfileInfo').innerHTML = profHtml;
            if (!appsCache) loadUserApps();
            else renderUserApps(user);
        }

        function loadUserApps() {
            db.ref('app_control/apps').once('value', function(snap) {
                appsCache = [];
                snap.forEach(function(child) { var a = child.val(); a.code = child.key; appsCache.push(a); });
                renderUserApps(currentUserFromCache());
            });
        }

        function currentUserFromCache() {
            for (var i = 0; i < users.length; i++) { if (users[i]._key === currentDetailUserKey) return users[i]; }
            return null;
        }

        function renderUserApps(user) {
            if (!user) return;
            var myApps = [];
            for (var i = 0; i < appsCache.length; i++) { if (appsCache[i].owner === user.username) myApps.push(appsCache[i]); }
            var now = Date.now();
            var active = 0, expired = 0;
            myApps.forEach(function(a) { if (a.status === 'Expired' || (a.expiryTime > 0 && now > a.expiryTime)) expired++; else active++; });
            document.getElementById('udStats').innerHTML =
                '<div style="text-align:center;padding:14px;background:rgba(0,230,118,0.08);border:1px solid rgba(0,230,118,0.25);border-radius:12px;"><div style="font-size:26px;font-weight:800;color:#00E676;">' + myApps.length + '</div><div style="font-size:12px;color:#AAA;">Total Codes</div></div>' +
                '<div style="text-align:center;padding:14px;background:rgba(0,210,255,0.08);border:1px solid rgba(0,210,255,0.25);border-radius:12px;"><div style="font-size:26px;font-weight:800;color:#00D2FF;">' + active + '</div><div style="font-size:12px;color:#AAA;">Active</div></div>' +
                '<div style="text-align:center;padding:14px;background:rgba(255,76,76,0.08);border:1px solid rgba(255,76,76,0.25);border-radius:12px;"><div style="font-size:26px;font-weight:800;color:#FF4C4C;">' + expired + '</div><div style="font-size:12px;color:#AAA;">Expired</div></div>';
            var listBox = document.getElementById('udAppsList');
            if (myApps.length === 0) { listBox.innerHTML = '<li style="text-align:center;color:#555;padding:20px;">No online codes generated yet.</li>'; return; }
            myApps.sort(function(a, b) { return b.timestamp - a.timestamp; });
            var html = '';
            myApps.forEach(function(a) {
                var exp = (a.status === 'Expired' || (a.expiryTime > 0 && now > a.expiryTime));
                var badge = exp ? '<span style="color:#FF4C4C;">EXPIRED</span>' : '<span style="color:#00E676;">ACTIVE</span>';
                var expText = a.expiryTime > 0 ? new Date(a.expiryTime).toLocaleString('en-IN') : 'No limit';
                html += '<li class="app-item"><div class="app-info"><h4>' + escapeHtml(a.name) + ' ' + badge + '</h4><p>Code: <b>' + escapeHtml(a.code) + '</b> &middot; Created: ' + new Date(a.timestamp).toLocaleString('en-IN') + '</p><p>Expires: ' + expText + '</p></div></li>';
            });
            listBox.innerHTML = html;
        }

        function addUser() {
            var username = document.getElementById('newUsername').value.trim();            var password = document.getElementById('newPassword').value.trim();
            var device = document.getElementById('newDevice').value.trim();
            var err = document.getElementById('userAddError');
            err.style.display = 'none';
            if (!username || !password) { err.textContent = 'Username and password required!'; err.style.display = 'block'; return; }
            if (password.length < 4) { err.textContent = 'Password min 4 characters!'; err.style.display = 'block'; return; }
            for (var i = 0; i < users.length; i++) { if (users[i].username === username) { err.textContent = 'Username already exists!'; err.style.display = 'block'; return; } }
            var deviceLimit = parseInt(document.getElementById('newDeviceLimit').value) || 0;
            usersRef.push({
                username: username,
                password: password,
                device: device || '',
                deviceLimit: deviceLimit,
                lockedDevices: [],
                created: Date.now()
            }).then(function() {
                document.getElementById('newUsername').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('newDevice').value = '';
                document.getElementById('newDeviceLimit').value = 1;
                showToast('User "' + username + '" added!');
            }).catch(function(e) { err.textContent = e.message; err.style.display = 'block'; });
        }

        function editUser(key) {
            for (var i = 0; i < users.length; i++) {
                if (users[i]._key === key) {
                    var user = users[i];
                    document.getElementById('editUserId').value = key;
                    document.getElementById('editUsername').value = user.username;
                    document.getElementById('editPassword').value = user.password;
                    document.getElementById('editDevice').value = user.device || '';
                    document.getElementById('editDeviceLimit').value = user.deviceLimit > 0 ? user.deviceLimit : 0;
                    document.getElementById('editUserError').style.display = 'none';
                    document.getElementById('editUserModal').classList.add('show');
                    return;
                }
            }
        }

        function saveEditUser() {
            var key = document.getElementById('editUserId').value;
            var username = document.getElementById('editUsername').value.trim();
            var password = document.getElementById('editPassword').value.trim();
            var device = document.getElementById('editDevice').value.trim();
            var deviceLimit = parseInt(document.getElementById('editDeviceLimit').value) || 0;
            var err = document.getElementById('editUserError');
            err.style.display = 'none';
            if (!username || !password) { err.textContent = 'Username and password required!'; err.style.display = 'block'; return; }
            if (password.length < 4) { err.textContent = 'Password min 4 chars!'; err.style.display = 'block'; return; }
            for (var i = 0; i < users.length; i++) {
                if (users[i]._key !== key && users[i].username === username) {
                    err.textContent = 'Username already exists!'; err.style.display = 'block'; return;
                }
            }
            usersRef.child(key).update({
                username: username,
                password: password,
                device: device || '',
                deviceLimit: deviceLimit
            }).then(function() {
                document.getElementById('editUserModal').classList.remove('show');
                showToast('User updated!');
            }).catch(function(e) { err.textContent = e.message; err.style.display = 'block'; });
        }

        function deleteUser(key) {
            if (!confirm('Delete this user?')) return;
            usersRef.child(key).remove().then(function() {
                showToast('User deleted!');
            });
        }

        function resetDevice(key) {
            if (!confirm('Reset device lock for this user?')) return;
            usersRef.child(key).update({ lockedDevices: [] }).then(function() {
                showToast('Device reset!');
            });
        }

        function closeEditModal() { document.getElementById('editUserModal').classList.remove('show'); }
        function closeCodeModal() { document.getElementById('appCodeModal').classList.remove('show'); }

        // --- NOTIFICATIONS (ADMIN) ---
        var adminNotifListener = null;

        function renderNotifTargets() {
            var sel = document.getElementById('notifTarget');
            if (!sel) return;
            sel.innerHTML = '';
            var optAll = document.createElement('option');
            optAll.value = 'ALL';
            optAll.textContent = 'All Users (Global)';
            sel.appendChild(optAll);
            var sorted = users.slice().sort(function(a, b) { return (a.username || '').localeCompare(b.username || ''); });
            for (var i = 0; i < sorted.length; i++) {
                var opt = document.createElement('option');
                opt.value = sorted[i].username;
                opt.textContent = sorted[i].username;
                sel.appendChild(opt);
            }
        }

        function renderAdminNotifs() {
            renderNotifTargets();
            if (adminNotifListener) { db.ref('notifications').off('value', adminNotifListener); adminNotifListener = null; }
            var container = document.getElementById('notifListContainer');
            adminNotifListener = db.ref('notifications').orderByChild('time').on('value', function(snapshot) {
                var notifs = [];
                snapshot.forEach(function(child) { var n = child.val(); n._key = child.key; notifs.push(n); });
                notifs.reverse();
                document.getElementById('notifCount').textContent = '(' + notifs.length + ')';
                if (notifs.length === 0) { container.innerHTML = '<li style="text-align:center;color:#555;padding:30px;"><i class="fas fa-bell" style="margin-right:8px;"></i> No notifications sent yet.</li>'; return; }
                var html = '';
                notifs.forEach(function(n) {
                    var readCount = n.readBy ? Object.keys(n.readBy).length : 0;
                    var targetLabel = n.target === 'ALL'
                        ? '<span class="badge b-active">ALL USERS</span>'
                        : '<span class="badge" style="background:rgba(255,179,0,0.15);color:#FFB300;">USER: ' + esc(n.user) + '</span>';
                    html += '<li class="app-item" style="flex-direction:column;align-items:stretch;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;"><h4>' + esc(n.text) + '</h4><div style="display:flex;gap:6px;align-items:center;">' + targetLabel +
                        '<button class="btn-sm" onclick="deleteNotification(\'' + n._key + '\')" style="background:rgba(255,76,76,0.15);color:#FF4C4C;border:none;border-radius:8px;padding:8px 12px;cursor:pointer;" title="Delete"><i class="fas fa-trash"></i></button>' +
                        '</div></div>' +
                        '<p style="font-size:11px;color:#888;margin-top:2px;"><i class="fas fa-crown" style="color:#B366FF;"></i> ADMIN &middot; ' + new Date(n.time || Date.now()).toLocaleString('en-IN') + ' &middot; Read by <b style="color:#00E676;">' + readCount + '</b> user(s)</p>' +
                        '</li>';
                });
                container.innerHTML = html;
            });
        }

        function sendNotification() {
            var text = document.getElementById('notifMsg').value.trim();
            var err = document.getElementById('notifSendError');
            if (!text) { err.textContent = 'Please enter a message!'; err.style.display = 'block'; return; }
            var target = document.getElementById('notifTarget').value;
            var isAll = (target === 'ALL');
            db.ref('notifications').push({
                text: text,
                time: Date.now(),
                from: 'ADMIN',
                target: isAll ? 'ALL' : 'user',
                user: isAll ? '' : target
            }).then(function() {
                err.style.display = 'none';
                document.getElementById('notifMsg').value = '';
                showToast('Notification sent!');
            }).catch(function() {
                err.textContent = 'Failed to send. Try again.'; err.style.display = 'block';
            });
        }

        function deleteNotification(key) {
            if (!confirm('Delete this notification?')) return;
            db.ref('notifications/' + key).remove().then(function() {
                showToast('Notification deleted!');
            });
        }

        function adminLogout() { localStorage.removeItem('adminSessionTime'); auth.signOut().then(function() { document.getElementById('loginOverlay').classList.remove('hidden'); }); }

        function showToast(msg) {
            var t = document.createElement('div');
            t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#00E676;color:#000;padding:14px 30px;border-radius:14px;font-weight:600;font-size:14px;box-shadow:0 15px 40px rgba(0,230,118,0.3);z-index:9999;font-family:Poppins,sans-serif;animation:fadeUp 0.3s ease;display:flex;align-items:center;gap:8px;';
            t.innerHTML = '<i class="fas fa-check-circle"></i> ' + msg;
            document.body.appendChild(t);
            setTimeout(function() { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(20px)'; t.style.transition = '0.4s'; setTimeout(function() { document.body.removeChild(t); }, 500); }, 2500);
        }

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !document.getElementById('loginOverlay').classList.contains('hidden')) adminLogin();
        });

        document.addEventListener('click', function(e) {
            var nav = document.getElementById('mobileNav');
            var toggle = document.getElementById('mobileToggle');
            if (nav.classList.contains('show') && !nav.contains(e.target) && !toggle.contains(e.target)) {
                nav.classList.remove('show');
            }
        });
    