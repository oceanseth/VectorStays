/**
 * VectorStays — support-call portal.
 *
 * Lives inside the main SPA (www/index.html). Activated when:
 *   • user.role === 'support' (default view on login)
 *   • hash is #calls or #call-<code>/#call-<bland_call_id> for any user with calls access
 *
 * Backend: www/api.php methods (getActiveCalls, getCall, acceptTransfer,
 * getListenUrl, takeCall) and Firebase RTDB under /calls/{id} and /transfers/{code}.
 */
(function () {
    var VectorCalls = {
        currentCallId: null,
        currentFbHandle: null, // Firebase child ref for transcript subscription
        listenWs: null,
        audioCtx: null,
        listening: false,
        nextPlaybackAt: 0,
        dashboardInterval: null,
    };
    window.VectorCalls = VectorCalls;

    function hideAllRightContent() { $(".rightContent").hide(); }
    function setHash(h) { if (window.location.hash !== h) window.location.hash = h; }

    function hasCallsAccess() {
        return window.user && (user.role === 'admin' || user.role === 'superadmin' || user.role === 'support');
    }

    // ------ entry points ---------------------------------------------------

    VectorCalls.bootstrap = function () {
        if (!hasCallsAccess()) return;
        var h = window.location.hash || '';
        if (h === '#calls' || /^#call-/.test(h)) {
            VectorCalls.handleHash();
        } else {
            VectorCalls.showDashboard();
        }
    };

    VectorCalls.handleHash = function () {
        if (!hasCallsAccess()) return;
        var h = window.location.hash || '';
        var m = h.match(/^#call-([A-Za-z0-9_\-]+)$/);
        if (m) {
            VectorCalls.showCall(m[1]);
        } else if (h === '#calls') {
            VectorCalls.showDashboard();
        }
    };

    // ------ dashboard ------------------------------------------------------

    VectorCalls.showDashboard = function () {
        if (!hasCallsAccess()) return;
        hideAllRightContent();
        $("#callsDashboard").show();
        setHash('#calls');
        VectorCalls.teardownDetail();
        loadDashboard();
        // Light polling so the dashboard stays fresh even if Firebase isn't wired.
        clearInterval(VectorCalls.dashboardInterval);
        VectorCalls.dashboardInterval = setInterval(loadDashboard, 5000);
    };

    function loadDashboard() {
        var listingId = $("#callsListingFilter").val() || '';
        var req = { method: 'getCallsDashboard' };
        if (listingId) req.listing_id = listingId;
        api(req, function (resp) {
            renderSummary(resp.summary || {});
            renderDailyChart(resp.daily || []);
            renderListingFilter(resp.listings || [], resp.listing_id || '');
            renderLiveTable(resp.active || []);
            renderRecentTable(resp.recent || []);
        }, true);
    }

    function renderSummary(s) {
        $("#callsMetricToday").text(s.today || 0);
        $("#callsMetricWeek").text(s.week || 0);
        $("#callsMetricTransferred").text(s.transferred_total || 0);
        $("#callsMetricAllTime").text(s.all_time || 0);
    }

    function renderListingFilter(listings, selected) {
        var $sel = $("#callsListingFilter");
        if ($sel.data('populated-with') === listings.length + ':' + selected) return;
        var current = $sel.val() || selected || '';
        $sel.empty().append('<option value="">All listings</option>');
        listings.forEach(function (l) {
            var label = l.nickname || l.address_city || l._id;
            $sel.append('<option value="' + escapeAttr(l._id) + '">' + escapeHtml(label) + '</option>');
        });
        $sel.val(current);
        $sel.data('populated-with', listings.length + ':' + selected);
        $sel.off('change.vc').on('change.vc', function () { loadDashboard(); });
    }

    function renderDailyChart(daily) {
        var ctx = document.getElementById('callsDailyChart');
        if (!ctx || typeof Chart === 'undefined') return;
        // Build a dense 30-day series so gaps show as 0.
        var days = [], counts = [], transferred = [];
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var byDay = {};
        daily.forEach(function (d) { byDay[d.day] = d; });
        for (var i = 29; i >= 0; i--) {
            var dt = new Date(today.getTime() - i * 86400000);
            var key = dt.toISOString().slice(0, 10);
            var rec = byDay[key] || { n: 0, transferred: 0 };
            days.push(key.slice(5)); // MM-DD
            counts.push(Number(rec.n) || 0);
            transferred.push(Number(rec.transferred) || 0);
        }
        var cfg = {
            type: 'bar',
            data: {
                labels: days,
                datasets: [
                    { label: 'Calls',       data: counts,      backgroundColor: 'rgba(60,140,255,0.65)' },
                    { label: 'Transferred', data: transferred, backgroundColor: 'rgba(40,200,120,0.8)' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { yAxes: [{ ticks: { beginAtZero: true, precision: 0 } }] },
                legend: { position: 'bottom' }
            }
        };
        if (VectorCalls._dailyChart) {
            VectorCalls._dailyChart.data = cfg.data;
            VectorCalls._dailyChart.update();
        } else {
            VectorCalls._dailyChart = new Chart(ctx.getContext('2d'), cfg);
        }
    }

    function renderLiveTable(calls) {
        var $tbody = $("#callsLiveTable tbody").empty();
        var $badge = $("#callsLiveBadge");
        if (calls.length) { $badge.text(calls.length).show(); } else { $badge.hide(); }
        $("#callsDashboardStatus").text(
            calls.length ? (calls.length + ' active') : 'No active calls right now.'
        );
        calls.forEach(function (c) {
            var goto = c.pending_code ? ('#call-' + c.pending_code) : ('#call-' + c._id);
            var transferLabel = c.pending_code
                ? '<span class="badge badge-warning">pending ' + escapeHtml(c.pending_code) + '</span>'
                : (c.transferred_to_user_id ? '<span class="badge badge-success">accepted</span>' : '');
            $tbody.append(rowHtml(c, transferLabel, 'Open', goto));
        });
    }

    function renderRecentTable(calls) {
        var $tbody = $("#callsRecentTable tbody").empty();
        if (!calls.length) {
            $tbody.append('<tr><td colspan="6" class="text-muted text-center">No prior calls yet.</td></tr>');
            return;
        }
        calls.forEach(function (c) {
            var summary = c.summary ? escapeHtml(c.summary).slice(0, 140) : '<span class="text-muted">—</span>';
            $tbody.append(
                '<tr>' +
                    '<td>' + escapeHtml(c.started_at || '') + '</td>' +
                    '<td>' + escapeHtml(guestName(c)) + '</td>' +
                    '<td>' + escapeHtml(listingLabel(c)) + '</td>' +
                    '<td>' + escapeHtml(c.status || '') + '</td>' +
                    '<td>' + summary + '</td>' +
                    '<td><a class="btn btn-sm btn-default" href="#call-' + escapeAttr(c._id) + '">Transcript</a></td>' +
                '</tr>'
            );
        });
    }

    function rowHtml(c, transferLabel, btnLabel, href) {
        return '<tr>' +
            '<td>' + escapeHtml(c.started_at || '') + '</td>' +
            '<td>' + escapeHtml(guestName(c)) + '</td>' +
            '<td>' + escapeHtml(listingLabel(c)) + '</td>' +
            '<td>' + escapeHtml(c.status || '') + '</td>' +
            '<td>' + transferLabel + '</td>' +
            '<td><a class="btn btn-sm btn-primary" href="' + escapeAttr(href) + '">' + btnLabel + '</a></td>' +
        '</tr>';
    }

    function guestName(c) {
        return [c.guest_first, c.guest_last].filter(Boolean).join(' ') || (c.from_number || '—');
    }

    function listingLabel(c) {
        return c.listing_nickname || (c.listing_city ? 'Listing in ' + c.listing_city : '—');
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/"/g, '&quot;');
    }

    // ------ call detail ----------------------------------------------------

    VectorCalls.showCall = function (codeOrId) {
        if (!hasCallsAccess()) return;
        hideAllRightContent();
        $("#callDetail").show();
        setHash('#call-' + codeOrId);
        VectorCalls.teardownDetail();

        // Reset UI.
        $("#callDetailTitle").text('Call ' + codeOrId);
        $("#callDetailStatus").text('loading...');
        $("#callContextBody").text('Looking up caller...');
        $("#callTranscript").empty();
        $("#btnAcceptTransfer, #btnTakeCall").hide();
        $("#btnToggleListen").prop('disabled', true).text('Start listening');

        // If it matches a transfer code pattern (our generator: 8 alnum chars),
        // route through acceptTransfer first. Otherwise treat as a bland call_id.
        var looksLikeTransferCode = /^[A-HJ-NP-Z2-9]{8}$/.test(codeOrId);
        if (looksLikeTransferCode) {
            api({ method: 'getCall', code: codeOrId }, function (r) { onCallLoaded(r, codeOrId); }, true);
        } else {
            api({ method: 'getCall', id: codeOrId }, function (r) { onCallLoaded(r, null); }, true);
        }
    };

    function onCallLoaded(resp, code) {
        if (!resp || !resp.call) {
            $("#callDetailStatus").text('not found');
            return;
        }
        var call = resp.call;
        VectorCalls.currentCallId = call._id;
        $("#callDetailStatus").text(call.status || '');
        $("#callDetailTitle").text('Call ' + (call._id || ''));
        renderContext(resp.context, call);
        renderTranscriptArray(Array.isArray(call.transcript) ? call.transcript : []);
        subscribeToTranscript(call._id);

        // Only the live-call controls (listen, accept, take) make sense while
        // the call is still in progress. For prior calls, show a transcript-only view.
        var isLive = call.status === 'in_progress';
        $("#btnAcceptTransfer, #btnTakeCall, #btnToggleListen").hide();
        if (!isLive) {
            $("#callAudioMeta").text('This call has ended — transcript only.');
            return;
        }

        $("#btnToggleListen").show().prop('disabled', false).off('click').on('click', function () {
            if (VectorCalls.listening) stopListening(); else startListening(call._id);
        });

        var transfer = resp.transfer;
        if (code && transfer && transfer.status === 'pending') {
            $("#btnAcceptTransfer").show().off('click').on('click', function () {
                api({ method: 'acceptTransfer', code: code }, function (r) {
                    if (r.Error) return;
                    $("#btnAcceptTransfer").hide();
                    $("#btnTakeCall").show();
                    $("#callDetailStatus").text('transfer accepted');
                });
            });
        } else {
            $("#btnTakeCall").show();
        }

        $("#btnTakeCall").off('click').on('click', function () {
            if (!confirm('Warm-transfer this call to your phone?')) return;
            api({ method: 'takeCall', call_id: call._id }, function (r) {
                if (r.Error) return;
                $("#callDetailStatus").text('transferred to your phone');
                $("#btnTakeCall").hide();
            });
        });
    }

    function renderContext(ctx, call) {
        var html = '';
        html += '<div><strong>From:</strong> ' + escapeHtml(call.from_number || '—') + '</div>';
        if (ctx && ctx.guest) {
            var g = ctx.guest;
            html += '<div><strong>Guest:</strong> ' + escapeHtml([g.firstName, g.lastName].filter(Boolean).join(' ')) +
                (g.email ? ' &middot; ' + escapeHtml(g.email) : '') + '</div>';
        } else {
            html += '<div><em>No matching guest in reservations DB.</em></div>';
        }
        if (ctx && ctx.listing) {
            var l = ctx.listing;
            html += '<div><strong>Listing:</strong> ' + escapeHtml(l.nickname || l.title || '') + '</div>';
            if (l.address_full) html += '<div class="text-muted" style="font-size:0.85em;">' + escapeHtml(l.address_full) + '</div>';
        }
        if (ctx && ctx.reservation) {
            var r = ctx.reservation;
            html += '<div class="mt-2"><strong>Reservation:</strong> ' + escapeHtml(r.status || '') +
                ' &middot; ' + escapeHtml(r.checkIn || '') + ' → ' + escapeHtml(r.checkOut || '') +
                (r.guestsCount ? (' &middot; ' + r.guestsCount + ' guests') : '') +
                (r.confirmationCode ? (' &middot; conf ' + escapeHtml(r.confirmationCode)) : '') + '</div>';
        }
        if (call.summary) html += '<hr><div><strong>AI summary:</strong> ' + escapeHtml(call.summary) + '</div>';
        $("#callContextBody").html(html);
    }

    // ------ transcript subscribe ------------------------------------------

    function subscribeToTranscript(callId) {
        if (!window.callsDb) {
            // Firebase not configured → poll every 2s.
            VectorCalls.currentFbHandle = setInterval(function () {
                api({ method: 'getCall', id: callId }, function (r) {
                    if (r.call && Array.isArray(r.call.transcript)) renderTranscriptArray(r.call.transcript);
                    if (r.call) $("#callDetailStatus").text(r.call.status || '');
                }, true);
            }, 2000);
            VectorCalls.currentFbHandleKind = 'interval';
            return;
        }
        try {
            var ref = window.callsDb.ref('/calls/' + callId + '/transcript');
            var onValue = ref.on('value', function (snap) {
                var val = snap.val();
                if (!val) return;
                // PATCH/PUT stores it as array; POSTs would store as object keyed by autoId.
                var chunks = Array.isArray(val) ? val : Object.keys(val).sort().map(function (k) { return val[k]; });
                renderTranscriptArray(chunks);
            });
            var metaRef = window.callsDb.ref('/calls/' + callId + '/meta');
            var onMeta = metaRef.on('value', function (snap) {
                var m = snap.val() || {};
                if (m.status) $("#callDetailStatus").text(m.status);
            });
            VectorCalls.currentFbHandle = { ref: ref, cb: onValue, metaRef: metaRef, metaCb: onMeta };
            VectorCalls.currentFbHandleKind = 'firebase';
        } catch (e) {
            console.warn('Firebase subscribe failed, falling back to polling:', e.message);
            window.callsDb = null;
            subscribeToTranscript(callId);
        }
    }

    function renderTranscriptArray(chunks) {
        var $t = $("#callTranscript");
        var atBottom = $t[0].scrollTop + $t[0].clientHeight >= $t[0].scrollHeight - 30;
        $t.empty();
        chunks.forEach(function (c) {
            var color = (c.role === 'assistant' || c.role === 'agent') ? '#2d7' : '#39f';
            var when = c.at ? (' <span class="text-muted" style="font-size:0.75em;">' + escapeHtml(c.at) + '</span>') : '';
            $t.append(
                '<div><span style="color:' + color + ';"><strong>' + escapeHtml(c.role || '?') + ':</strong></span> '
                + escapeHtml(c.text || '') + when + '</div>'
            );
        });
        if (atBottom) $t[0].scrollTop = $t[0].scrollHeight;
    }

    // ------ listen (browser audio via bland listen WebSocket) --------------

    function startListening(callId) {
        api({ method: 'getListenUrl', call_id: callId }, function (r) {
            if (!r.url) return;
            if (!VectorCalls.audioCtx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                VectorCalls.audioCtx = new AC({ sampleRate: 16000 });
            }
            VectorCalls.nextPlaybackAt = VectorCalls.audioCtx.currentTime;
            var ws = new WebSocket(r.url);
            ws.binaryType = 'arraybuffer';
            ws.onopen    = function () {
                VectorCalls.listening = true;
                $("#btnToggleListen").text('Stop listening');
                $("#callAudioMeta").text('Listening — PCM16 @ 16kHz');
            };
            ws.onmessage = function (ev) { playPcm16(ev.data); };
            ws.onclose   = function () { stopListening(); };
            ws.onerror   = function (e) {
                console.warn('listen ws error', e);
                $("#callAudioMeta").text('listen error — call may have ended');
                stopListening();
            };
            VectorCalls.listenWs = ws;
        }, true);
    }

    function stopListening() {
        VectorCalls.listening = false;
        if (VectorCalls.listenWs) { try { VectorCalls.listenWs.close(); } catch (e) {} VectorCalls.listenWs = null; }
        $("#btnToggleListen").text('Start listening');
    }

    function playPcm16(arrayBuffer) {
        var ctx = VectorCalls.audioCtx;
        if (!ctx) return;
        var int16 = new Int16Array(arrayBuffer);
        if (!int16.length) return;
        var float32 = new Float32Array(int16.length);
        for (var i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;
        var buf = ctx.createBuffer(1, float32.length, 16000);
        buf.copyToChannel ? buf.copyToChannel(float32, 0) : buf.getChannelData(0).set(float32);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        var startAt = Math.max(VectorCalls.nextPlaybackAt, ctx.currentTime);
        src.start(startAt);
        VectorCalls.nextPlaybackAt = startAt + float32.length / 16000;
    }

    // ------ teardown -------------------------------------------------------

    VectorCalls.teardownDetail = function () {
        stopListening();
        if (VectorCalls.currentFbHandle) {
            if (VectorCalls.currentFbHandleKind === 'interval') {
                clearInterval(VectorCalls.currentFbHandle);
            } else if (VectorCalls.currentFbHandleKind === 'firebase') {
                try {
                    VectorCalls.currentFbHandle.ref.off('value', VectorCalls.currentFbHandle.cb);
                    VectorCalls.currentFbHandle.metaRef.off('value', VectorCalls.currentFbHandle.metaCb);
                } catch (e) {}
            }
            VectorCalls.currentFbHandle = null;
            VectorCalls.currentFbHandleKind = null;
        }
        VectorCalls.currentCallId = null;
    };

    // ------ utils ----------------------------------------------------------

    function escapeHtml(s) {
        return (s == null ? '' : String(s))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
})();
