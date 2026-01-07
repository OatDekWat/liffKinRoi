// --- ตั้งค่า ---
const LIFF_ID = "2008809721-wkEpHOm0"; // LIFF ID ของคุณ
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzg0_0f7QP28CFwbXCjS7qHk4pA16ItaAHXqBpnx0SeRwJ-gHmjXIXvxnM8ovtZ-Gsn/exec"; 

// --- ตัวแปรระบบ ---
let userProfile = null;
let isAdmin = false;
let currentTable = null;

const indoorTables = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const outdoorTables = [10, 11, 12, 14];

// --- MAIN FUNCTION ---
async function main() {
    try {
        // 1. เริ่มต้น LIFF เพื่อดึงข้อมูลผู้ใช้
        await liff.init({ liffId: LIFF_ID });
        
        // ถ้ายังไม่ Login ให้ Login ก่อน
        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }

        // 2. ดึงโปรไฟล์ (ชื่อไลน์, รูป, ID)
        userProfile = await liff.getProfile();
        document.getElementById('welcome-msg').innerText = `สวัสดี, ${userProfile.displayName}`;
        
        // 3. เริ่มระบบ
        checkAdminStatus(); // เช็คว่าเป็นแอดมินไหมจาก UserID
        fetchTableStatus(); // ดึงสถานะโต๊ะ
        setInterval(fetchTableStatus, 5000); // อัปเดตทุก 5 วิ

    } catch (err) {
        console.error('LIFF Init Error:', err);
        Swal.fire('Error', 'ไม่สามารถเชื่อมต่อ LINE ได้ กรุณาตรวจสอบ LIFF ID', 'error');
    }
}

// --- LOGIC เวลาเปิด-ปิด ---
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

async function checkAdminStatus() {
    try {
        const res = await fetch(`${APPS_SCRIPT_URL}?op=checkAdmin&userId=${userProfile.userId}`);
        const data = await res.json();
        if (data.isAdmin) {
            isAdmin = true;
            document.getElementById('admin-panel').classList.remove('hidden');
        }
    } catch(e) { console.warn(e); }
}

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
        
        // ถ้าเป็น Admin จะเห็นชื่อลูกค้า
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
    // Admin เคลียร์โต๊ะ
    if (isAdmin && isBusy) {
        Swal.fire({
            title: `เคลียร์โต๊ะ ${tableNo}?`,
            text: 'ยืนยันว่าลูกค้าเช็คบิลแล้ว',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ใช่, เคลียร์',
            confirmButtonColor: '#80332d'
        }).then((res) => {
            if (res.isConfirmed) sendData({ action: 'admin_clear', userId: userProfile.userId, tableNo: tableNo });
        });
        return;
    }

    const shopStatus = checkShopOpen();
    if (!shopStatus.open && !isAdmin) {
        Swal.fire('ร้านปิด', shopStatus.reason, 'warning');
        return;
    }

    if (isBusy) {
        Swal.fire('เต็ม', 'โต๊ะนี้มีคนจองแล้วครับ', 'error');
        return;
    }

    currentTable = tableNo;
    document.getElementById('modal-table-no').innerText = tableNo;
    document.getElementById('bookingModal').classList.remove('hidden');
};

window.closeModal = () => document.getElementById('bookingModal').classList.add('hidden');

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    closeModal();

    // สร้างข้อมูลที่จะส่ง (Payload)
    // ตรงนี้เราจะดึง UserID และ DisplayName ของไลน์ส่งไปด้วย
    const payload = {
        action: 'book',
        userId: userProfile.userId,           // <-- ดึง ID ไลน์จริง
        displayName: userProfile.displayName, // <-- ดึงชื่อไลน์จริง
        nickname: document.getElementById('input-nickname').value,
        phone: document.getElementById('input-phone').value,
        time: document.getElementById('input-time').value,
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

        if (payload.action === 'book') {
            // ส่งข้อความยืนยันเข้าแชทไลน์ (เฉพาะตอนจอง)
            if (liff.isInClient()) {
                await liff.sendMessages([{
                    type: 'text',
                    text: `📌 จองโต๊ะสำเร็จ!\n\nโต๊ะ: T-${payload.tableNo}\nชื่อ: ${payload.nickname}\nเบอร์: ${payload.phone}\nเวลา: ${payload.time}\n\nขอบคุณที่ใช้บริการครับ 🙏`
                }]);
                liff.closeWindow();
            } else {
                Swal.fire('สำเร็จ', 'จองเรียบร้อยแล้ว!', 'success').then(() => fetchTableStatus());
            }
        } else {
            // กรณี Admin Clear
            setTimeout(() => {
                Swal.fire('สำเร็จ', 'เคลียร์โต๊ะแล้ว', 'success').then(() => fetchTableStatus());
            }, 1000);
        }

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'เชื่อมต่อ Server ไม่ได้', 'error');
    }
}

main();