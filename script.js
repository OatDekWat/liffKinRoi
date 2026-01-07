// --- ตั้งค่า ---
// ไม่ต้องใช้ LIFF_ID แล้ว
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzg0_0f7QP28CFwbXCjS7qHk4pA16ItaAHXqBpnx0SeRwJ-gHmjXIXvxnM8ovtZ-Gsn/exec"; // ใช้ URL เดิมของคุณ

// --- ตัวแปรระบบ ---
// let userProfile = null; // ลบออก
let isAdmin = false;       // จะเป็น false เสมอ เพราะไม่มีการเช็ค LINE ID
let currentTable = null;

const indoorTables = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const outdoorTables = [10, 11, 12, 14];

// --- MAIN FUNCTION (แก้ไขใหม่ ไม่ต้องรอ LIFF) ---
async function main() {
    try {
        // 1. แสดงข้อความต้อนรับทั่วไป
        document.getElementById('welcome-msg').innerText = "ยินดีต้อนรับลูกค้าทุกท่าน";
        
        // 2. ไม่มีการเช็ค Admin (เพราะไม่มี User ID)
        // checkAdminStatus(); 
        
        // 3. ดึงสถานะโต๊ะทันที
        fetchTableStatus();
        setInterval(fetchTableStatus, 10000); // Auto refresh 10s

    } catch (err) {
        console.error('Init Error:', err);
    }
}

// --- LOGIC เวลาเปิด-ปิด (เหมือนเดิม) ---
function checkShopOpen() {
    const now = new Date();
    const hour = now.getHours();
    let day = now.getDay(); 

    if (hour < 5) {
        day = day - 1;
        if (day === -1) day = 6;
    }

    if (day === 1) return { open: false, reason: 'ร้านหยุดทุกวันจันทร์ครับ' };
    
    if (hour >= 5 && hour < 16) {
         return { open: false, reason: 'ร้านยังไม่เปิด (เปิด 16:00 - 05:00 น.)' };
    }
    
    return { open: true };
}

// ฟังก์ชัน Admin ถูกปิดไว้ เพราะไม่มี Login
/*
async function checkAdminStatus() {
    ...
}
*/

async function fetchTableStatus() {
    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?op=getStatus`);
        const data = await res.json();
        renderTables(data);
    } catch (e) { console.error('Fetch Error:', e); }
}

function renderTables(statusData) {
    const statusMap = {};
    statusData.forEach(row => {
        statusMap[row[0]] = { status: row[1], info: row[2] };
    });

    const createCard = (num) => {
        const info = statusMap[num] || { status: 'Available', info: '' };
        const isBusy = (info.status !== 'Available' && info.status !== 'ว่าง');
        
        let bgClass = isBusy 
            ? 'bg-primary text-white border-primary shadow-inner opacity-90' 
            : 'bg-white text-primary border-secondary hover:bg-yellow-50 shadow-md';
        
        let icon = isBusy ? '❌' : '✅';
        let subText = isBusy ? 'ไม่ว่าง' : 'ว่าง';
        
        // ส่วนแสดงชื่อลูกค้า (Admin) จะไม่ทำงานในโหมด Guest
        let customerNameHtml = '';
        if (isAdmin && isBusy && info.info) {
            customerNameHtml = `<div class="text-[10px] bg-black/20 rounded px-1 mt-1 truncate w-full">${info.info}</div>`;
        }

        return `
        <div onclick="handleTableClick(${num}, ${isBusy})" 
             class="table-card relative h-24 rounded-xl border-2 flex flex-col justify-center items-center cursor-pointer select-none ${bgClass}">
            <div class="text-xl font-bold">T-${num}</div>
            <div class="text-xs flex items-center gap-1 opacity-80">
                <span>${icon}</span> ${subText}
            </div>
            ${customerNameHtml}
        </div>`;
    };

    document.getElementById('indoor-zone').innerHTML = indoorTables.map(num => createCard(num)).join('');
    document.getElementById('outdoor-zone').innerHTML = outdoorTables.map(num => createCard(num)).join('');
}

window.handleTableClick = (tableNo, isBusy) => {
    // ไม่มีโหมด Admin Clear โต๊ะในเวอร์ชัน Guest
    if (isBusy) {
        Swal.fire('เต็ม', 'โต๊ะนี้มีคนจองแล้วครับ', 'error');
        return;
    }

    const shopStatus = checkShopOpen();
    if (!shopStatus.open) {
        Swal.fire('ร้านปิด', shopStatus.reason, 'warning');
        return;
    }

    currentTable = tableNo;
    document.getElementById('modal-table-no').innerText = tableNo;
    document.getElementById('bookingModal').classList.remove('hidden');
};

window.closeModal = () => document.getElementById('bookingModal').classList.add('hidden');

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // ดึงค่าจากฟอร์ม
    const nicknameVal = document.getElementById('input-nickname').value;
    const phoneVal = document.getElementById('input-phone').value;
    const timeVal = document.getElementById('input-time').value;

    closeModal();

    // สร้างข้อมูลจำลอง (Dummy Data) เพราะไม่ได้ Login
    const payload = {
        action: 'book',
        userId: 'guest_' + Date.now(), // สร้าง ID มั่วๆ ให้ไม่ซ้ำ
        displayName: nicknameVal,      // ใช้ชื่อเล่นเป็น DisplayName เลย
        nickname: nicknameVal,
        phone: phoneVal,
        time: timeVal,
        tableNo: currentTable
    };

    await sendData(payload);
});

async function sendData(payload) {
    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        // แสดงผลสำเร็จเสมอ (ไม่ต้องเช็ค liff.isInClient)
        Swal.fire({
            icon: 'success',
            title: 'จองสำเร็จ!',
            text: `โต๊ะ T-${payload.tableNo} เวลา ${payload.time}`,
            confirmButtonText: 'ตกลง'
        }).then(() => fetchTableStatus());

    } catch (err) {
        console.error(err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อ Server ได้', 'error');
    }
}

main();