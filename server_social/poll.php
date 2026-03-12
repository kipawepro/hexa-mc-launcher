<?php
// poll.php (The Fluid "No Refresh" Core)
// Long Polling: Returns JSON only when data changes or timeout (30s)

require_once 'config.php';

// Params
$username = $_GET['user'] ?? '';
$lastMsgId = (int)($_GET['last_msg'] ?? 0);
$lastReqId = (int)($_GET['last_req'] ?? 0);
$token = $_GET['token'] ?? ''; // Auth Token

if (!$username) {
    echo json_encode(['error' => 'Missing username']);
    exit;
}

$userId = verifyToken($pdo, $username, $token);
if (!$userId) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Update Last Seen
$stmt = $pdo->prepare("UPDATE hexa_users SET last_seen = NOW(), status = 'online' WHERE id = ?");
$stmt->execute([$userId]);

// Long Polling Loop (Max 25s to avoid browser timeout)
$start = time();
while (time() - $start < 25) {
    
    // Check Messages
    // New messages where (to_user = ME AND id > lastMsgId) OR (from_user = ME AND id > lastMsgId)
    $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM hexa_messages WHERE (receiver_id = ? OR sender_id = ?) AND id > ?");
    $stmt->execute([$userId, $userId, $lastMsgId]);
    $newMsgs = $stmt->fetchColumn();

    // Check Friend Requests
    $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM hexa_friend_requests WHERE to_user = ? AND id > ?");
    $stmt->execute([$userId, $lastReqId]);
    $newReqs = $stmt->fetchColumn();

    // Check Friends Status (Online/Offline changes)
    // This is trickier with simple ID polling, usually client polls status separately periodically or we track a global 'event_id'
    // For simplicity, we just return if messages/requests happen.
    
    if ($newMsgs > 0 || $newReqs > 0) {
        // Fetch Data
        
        // 1. Get New Messages
        $stmt = $pdo->prepare("
            SELECT m.*, u.username as sender_name 
            FROM hexa_messages m 
            JOIN hexa_users u ON m.sender_id = u.id 
            WHERE (m.receiver_id = ? OR m.sender_id = ?) AND m.id > ? 
            ORDER BY m.id ASC
        ");
        $stmt->execute([$userId, $userId, $lastMsgId]);
        $messages = $stmt->fetchAll();
        
        // 2. Get New Requests
        $stmt = $pdo->prepare("
            SELECT r.*, u.username as from_name 
            FROM hexa_friend_requests r 
            JOIN hexa_users u ON r.from_user = u.id 
            WHERE r.to_user = ? AND r.id > ?
        ");
        $stmt->execute([$userId, $lastReqId]);
        $requests = $stmt->fetchAll();

        echo json_encode([
            'success' => true,
            'messages' => $messages,
            'requests' => $requests,
            'sync_time' => time()
        ]);
        exit;
    }

    // Wait 1s before next check
    sleep(1);
    
    // Clear cache/connection buffers
    if(function_exists('opcache_reset')) opcache_reset();
}

// Timeout with no data (Client should reconnect immediately)
echo json_encode(['success' => true, 'timeout' => true]);
?>