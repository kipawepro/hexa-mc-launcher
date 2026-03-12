<?php
// chat.php (Send / Fetch History)
require_once 'config.php';

$action = $_GET['action'] ?? '';
$username = $_POST['user'] ?? $_GET['user'] ?? '';
$token = $_POST['token'] ?? $_GET['token'] ?? '';
$friend = $_POST['friend'] ?? $_GET['friend'] ?? '';
$msg = $_POST['message'] ?? '';

$userId = verifyToken($pdo, $username, $token);
if (!$userId) { echo json_encode(['error'=>'Auth failed']); exit; }

if ($action === 'send') {
    if (!$friend || !$msg) die(json_encode(['error' => 'Missing friend or message']));

    $friendId = verifyToken($pdo, $friend, $token); // Or just look up ID
    if (!$friendId) die(json_encode(['error' => 'Friend not found']));

    $stmt = $pdo->prepare("INSERT INTO hexa_messages (sender_id, receiver_id, message, created_at) VALUES (?, ?, ?, NOW())");
    $stmt->execute([$userId, $friendId, $msg]);

    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);

} else if ($action === 'fetch') {
    if (!$friend) die(json_encode(['error' => 'Friend needed']));
    
    $friendId = verifyToken($pdo, $friend, $token);

    $stmt = $pdo->prepare("
        SELECT * FROM hexa_messages 
        WHERE (sender_id = ? AND receiver_id = ?) 
           OR (sender_id = ? AND receiver_id = ?) 
        ORDER BY created_at ASC
        LIMIT 50
    ");
    $stmt->execute([$userId, $friendId, $friendId, $userId]);
    $msgs = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['success' => true, 'messages' => $msgs]);
}
?>