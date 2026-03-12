const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// WARNING: In a production environment, database credentials should not be hardcoded 
// and the client should NOT connect directly to the database. 
// Ideally, use a REST API. For this custom launcher, we will connect directly as requested.

const dbConfig = {
    host: 'sql3.minestrator.com',
    user: 'minesr_VODW8dwu',
    password: 'NfocLnAinfeyr9WU',
    database: 'minesr_VODW8dwu',
    connectTimeout: 5000 // 5 seconds timeout
};

async function authenticateUser(identifier, password) {
    let connection;
    try {
        console.log(`[DB] Attempting connection to ${dbConfig.host}...`);
        connection = await mysql.createConnection(dbConfig);
        console.log("[DB] Connected.");
        
        // Find user by username OR email
        const [rows] = await connection.execute(
            'SELECT * FROM hexa_users WHERE username = ? OR email = ?',
            [identifier, identifier]
        );

        if (rows.length === 0) {
            console.log("[DB] User not found.");
            await connection.end();
            return { success: false, message: "User not found" };
        }

        const user = rows[0];

        // Verify password
        console.log("[DB] Verifying password...");
        const match = await bcrypt.compare(password, user.password_hash);
        await connection.end();
        
        if (!match) {
            console.log("[DB] Password mismatch.");
            return { success: false, message: "Invalid password" };
        }
        
        console.log("[DB] Login success.");

        // Return user info needed for the launcher
        // Minecraft requires a valid UUID format (8-4-4-4-12 hex)
        // If one is missing from DB, we must provide a valid dummy one, NOT 'offline-uuid'
        let validUuid = user.minecraft_uuid;
        if (!validUuid || validUuid.length < 32) {
             validUuid = '88888888-8888-8888-8888-888888888888';
        }

        return {
            success: true,
            user: {
                id: user.id,
                capeUrl: user.cape_url,
                role: user.role
            }
        };

    } catch (error) {
        console.error('Database/Auth Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}


async function fetchUsers() {
    let connection;
    try {
        console.log(`[DB] Fetching all database users...`);
        connection = await mysql.createConnection(dbConfig);
        
        // Fetch all users except strictly private data, only get info useful for friends list.
        const [rows] = await connection.execute('SELECT username, skin_url, role FROM hexa_users LIMIT 50');
        
        await connection.end();
        return { success: true, users: rows };
    } catch (error) {
        console.error('Database Fetch Users Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}

async function addFriend(userId, friendUsername) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        const [rows] = await connection.execute(
            'SELECT id FROM hexa_users WHERE username = ? OR email = ?',
            [friendUsername, friendUsername]
        );
        
        if (rows.length === 0) {
            await connection.end();
            return { success: false, message: "Ami(e) introuvable." };
        }
        
        const friendId = rows[0].id;
        if (userId === friendId) {
            await connection.end();
            return { success: false, message: "Vous ne pouvez pas vous ajouter vous-même." };
        }
        
        try {
            await connection.execute(
                'INSERT INTO hexa_friends (user_id, friend_id, status) VALUES (?, ?, "pending")',
                [userId, friendId]
            );
        } catch(e) {
            if (e.code === 'ER_DUP_ENTRY') {
                await connection.end();
                return { success: false, message: "Demande déjà envoyée ou vous êtes déjà amis." };
            }
            throw e;
        }

        await connection.end();
        return { success: true };
    } catch (error) {
        console.error('Database Add Friend Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}

async function acceptFriend(userId, friendId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'UPDATE hexa_friends SET status = "accepted" WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
            [friendId, userId, userId, friendId]
        );
        await connection.execute(
            'INSERT IGNORE INTO hexa_friends (user_id, friend_id, status) VALUES (?, ?, "accepted")',
            [userId, friendId]
        );
        await connection.end();
        return { success: true };
    } catch (error) {
        console.error('Database Accept Friend Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}

async function rejectFriend(userId, friendId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'DELETE FROM hexa_friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
            [userId, friendId, friendId, userId]
        );
        await connection.end();
        return { success: true };
    } catch (error) {
        console.error('Database Reject Friend Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}

async function fetchFriends(userId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Accepted friends
        const [accepted] = await connection.execute(`
            SELECT u.id, u.username as username, 
                   u.skin_url as skin_url, 
                   u.role, 'accepted' as friendship_status
            FROM hexa_friends f
            JOIN hexa_users u ON f.friend_id = u.id
            WHERE f.user_id = ? AND f.status = 'accepted'
        `, [userId]);
        
        // Pending received requests
        const [pending] = await connection.execute(`
            SELECT u.id, u.username as username, 
                   u.skin_url as skin_url, 
                   u.role, 'pending' as friendship_status
            FROM hexa_friends f
            JOIN hexa_users u ON f.user_id = u.id
            WHERE f.friend_id = ? AND f.status = 'pending'
        `, [userId]);

        // Merge arrays
        const rows = [...accepted, ...pending];
        
        await connection.end();
        return { success: true, friends: rows };
    } catch (error) {
        console.error('Database Fetch Friends Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}

// MESSAGING SYSTEM
async function getMessages(userId, friendId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        // We attempt to select id, sender_id, receiver_id, message.
        // We also cheat and select CURRENT_TIMESTAMP as created_at to avoid frontend errors 
        // until the column is added to the schema.
        const [rows] = await connection.execute(`
            SELECT id, sender_id, receiver_id, message, CURRENT_TIMESTAMP as created_at
            FROM hexa_messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
            ORDER BY id ASC
            LIMIT 50
        `, [userId, friendId, friendId, userId]);
        await connection.end();
        return { success: true, messages: rows };
    } catch (error) {
        console.error('Database getMessages Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}

async function sendMessage(userId, friendId, message) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(
            'INSERT INTO hexa_messages (sender_id, receiver_id, message) VALUES (?, ?, ?)',
            [userId, friendId, message]
        );
        await connection.end();
        return { success: true };
    } catch (error) {
        console.error('Database sendMessage Error:', error);
        if(connection) await connection.end().catch(() => {});
        return { success: false, message: "Server Error: " + error.message };
    }
}


async function getUserId(username) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rows] = await connection.execute('SELECT id FROM hexa_users WHERE username = ? OR email = ?', [username, username]);
        await connection.end();
        return rows.length > 0 ? rows[0].id : null;
    } catch(e) {
        if(connection) await connection.end();
        return null;
    }
}

async function editMessage(msgId, newContent, userId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(
            'UPDATE hexa_messages SET message = ? WHERE id = ? AND sender_id = ?', 
            [newContent, msgId, userId]
        );
        await connection.end();
        if (result.affectedRows === 0) return { success: false, message: "Message introuvable ou vous n'êtes pas l'auteur." };
        return { success: true };
    } catch(e) {
         if(connection) await connection.end().catch(()=>{});
         return { success: false, message: e.message };
    }
}

async function deleteMessage(msgId, userId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(
            'DELETE FROM hexa_messages WHERE id = ? AND sender_id = ?', 
            [msgId, userId]
        );
        await connection.end();
        if (result.affectedRows === 0) return { success: false, message: "Message introuvable ou vous n'êtes pas l'auteur." };
        return { success: true };
    } catch(e) {
         if(connection) await connection.end().catch(()=>{});
         return { success: false, message: e.message };
    }
}

module.exports = { authenticateUser, fetchUsers, addFriend, fetchFriends, acceptFriend, rejectFriend, getMessages, sendMessage, getUserId, editMessage, deleteMessage };
