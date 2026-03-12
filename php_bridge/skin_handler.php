<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET');
header('Access-Control-Allow-Headers: Content-Type');

$storage_path = '../storage/hexa/skins/';
if (!file_exists($storage_path)) {
    mkdir($storage_path, 0777, true);
}

$action = $_REQUEST['action'] ?? '';
$username = $_REQUEST['username'] ?? 'Steves'; // Default fallback

// FIX 1: Autoriser les points (.) et les tirets (-) dans les pseudos (ex: hg.oo)
$username = preg_replace('/[^a-zA-Z0-9_.\-]/', '', $username);

// Fonction pour trouver le fichier exact avec les nombres (ex: hg.oo-17707...png)
function getLatestSkinPath($storage_path, $username) {
    $pattern = $storage_path . $username . "*.png";
    $files = glob($pattern);
    if (!empty($files)) {
        usort($files, function($a, $b) { return filemtime($b) - filemtime($a); });
        return $files[0];
    }
    return false;
}

$actual_file_path = getLatestSkinPath($storage_path, $username);
$file_path = $storage_path . $username . '-' . round(microtime(true) * 1000) . '-' . mt_rand(100000000, 999999999) . '.png';

if ($action === 'upload') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        die(json_encode(['error' => 'POST required']));
    }
    if (!isset($_FILES['skin'])) {
        die(json_encode(['error' => 'No file uploaded']));
    }
    $file = $_FILES['skin'];
    
    $check = getimagesize($file['tmp_name']);
    if ($check === false || $check['mime'] !== 'image/png') {
        die(json_encode(['error' => 'File is not a valid PNG image']));
    }

    $width = $check[0];
    $height = $check[1];
    if ($width !== 64 || ($height !== 64 && $height !== 32)) {
        die(json_encode(['error' => "Invalid dimensions: $width x $height. Must be 64x64 or 64x32."]));
    }

    if (move_uploaded_file($file['tmp_name'], $file_path)) {
        echo json_encode(['success' => true, 'message' => 'Skin uploaded successfully']);
    } else {
        http_response_code(500);
        die(json_encode(['error' => 'Failed to move uploaded file']));
    }
} 
elseif ($action === 'get_skin') {
    header('Content-Type: image/png');
    
    // FIX 2: Utiliser la fonction pour trouver le bon chemin
    if ($actual_file_path && file_exists($actual_file_path)) {
        readfile($actual_file_path);
        exit;
    }
    
    // Si aucun fichier trouvé, skin par défaut Mojang
    $mojang_url = "https://minotar.net/skin/$username/64.png";
    $content = @file_get_contents($mojang_url);
    if ($content) {
        echo $content;
        exit;
    }
    
    $im = imagecreate(64, 64);
    imagecolorallocate($im, 0, 0, 0);
    imagepng($im);
    imagedestroy($im);
    exit;
}
elseif ($action === 'get_head') {
    header('Content-Type: image/png');
    
    // FIX 3: Utiliser la fonction pour trouver le fichier exact même pour la tête
    if (!$actual_file_path || !file_exists($actual_file_path)) {
        $mojang_url = "https://minotar.net/helm/$username/64.png";
        $content = @file_get_contents($mojang_url);
        if ($content) {
            echo $content;
            exit;
        }
        $im = imagecreate(8, 8);
        imagecolorallocate($im, 0, 0, 0);
        imagepng($im);
        imagedestroy($im);
        exit;
    }

    $source = imagecreatefrompng($actual_file_path);
    $scale = 8;
    $dest_w = 8 * $scale;
    $dest = imagecreatetruecolor($dest_w, $dest_w);
    
    imagealphablending($dest, false);
    imagesavealpha($dest, true);
    $transparent = imagecolorallocatealpha($dest, 255, 255, 255, 127);
    imagefilledrectangle($dest, 0, 0, $dest_w, $dest_w, $transparent);
    imagealphablending($dest, true); 

    imagecopyresampled($dest, $source, 0, 0, 8, 8, $dest_w, $dest_w, 8, 8);
    if (imagesy($source) >= 64 || true) {
        $hat_part = imagecreatetruecolor($dest_w, $dest_w);
        imagealphablending($hat_part, false);
        imagesavealpha($hat_part, true);
        imagefilledrectangle($hat_part, 0, 0, $dest_w, $dest_w, $transparent);
        
        imagecopyresampled($hat_part, $source, 0, 0, 40, 8, $dest_w, $dest_w, 8, 8);
        imagecopy($dest, $hat_part, 0, 0, 0, 0, $dest_w, $dest_w);
        imagedestroy($hat_part);
    }

    imagepng($dest);
    imagedestroy($dest);
    imagedestroy($source);
} 
else {
    echo json_encode(['error' => 'Invalid action']);
}
?>
