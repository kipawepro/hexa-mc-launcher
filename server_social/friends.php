<?php
// friends.php (List, Requests, Add, Delete)
require_once 'config.php';

$action = $_GET['action'] ?? 'list';
$username = $_POST['user'] ?? $_GET['user'] ?? '';
$token = $_POST['token'] ?? $_GET['token'] ?? '';
$other = $_POST['target'] ?? $_GET['target'] ?? '';

$userId = verifyToken($pdo, $username, $token);
if (!$userId) { echo json_encode(['error'=>'Auth failed']); exit; }

if ($action === 'list') {
    // Return Friends List + Their Status
    $stmt = $pdo->prepare("
        SELECT f.friend_id, u.username, u.status, u.last_seen 
        FROM hexa_friends f 
        JOIN hexa_users u ON f.friend_id = u.id 
        WHERE f.user_id = ?
    ");
    $stmt->execute([$userId]);
    $friends = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['success' => true, 'friends' => $friends]);

} elseif ($action === 'request') {
    if (!$other) die(json_encode(['error' => 'Target required']));

    $targetId = verifyToken($pdo, $other, $token);
    if (!$targetId) die(json_encode(['error' => 'User not found']));

    // Check if friends already
    $check = $pdo->prepare("SELECT COUNT(*) FROM hexa_friends WHERE user_id = ? AND friend_id = ?");
    $check->execute([$userId, $targetId]);
    if ($check->fetchColumn() > 0) die(json_encode(['error' => 'Already friends']));

    // Send Request
    $stmt = $pdo->prepare("INSERT INTO hexa_friend_requests (from_user, to_user, created_at) VALUES (?, ?, NOW())");
    $stmt->execute([$userId, $targetId]);

    echo json_encode(['success' => true]);

} elseif ($action === 'accept') {
    if (!$other) die(json_encode(['error' => 'Request ID or Target required']));

    $reqId = (int)$other; // Assuming ID here for simplicity

    // Verify Request exists and is for ME
    $stmt = $pdo->prepare("SELECT * FROM hexa_friend_requests WHERE id = ? AND to_user = ?");
    $stmt->execute([$reqId, $userId]);
    $req = $stmt->fetch();

    if (!$req) die(json_encode(['error' => 'Request not found']));

    // Add Friend (Both ways)
    $friendId = $req['from_user'];
    
    $ins = $pdo->prepare("INSERT INTO hexa_friends (user_id, friend_id, created_at) VALUES (?, ?, NOW()), (?, ?, NOW())");
    $ins->execute([$userId, $friendId, $friendId, $userId]);

    // Delete Request
    $del = $pdo->prepare("DELETE FROM hexa_friend_requests WHERE id = ?");
    $del->execute([$reqId]);

    echo json_encode(['success' => true]);
}
?>