/*
檔案用途：用一般使用者看得懂的步驟，教家庭管理者與受邀家人使用兩種家庭邀請。
所在層：src/features/system-admin/pages/guides 公開教學頁；未登入可閱讀，不讀取任何家庭或健康資料。
主要關聯：ContentGuideLayout、CareRecipientManagement、CaregiverInvitationManagement，以及 /join／/patient-invite。
*/
import { ContentGuideLayout, GuideList, GuideSection } from '../../../../components/ui/ContentGuideLayout'
import { useI18n } from '../../../../lib/i18n'

export function FamilyInvitationGuidePage() {
  const { text } = useI18n()

  return (
    <ContentGuideLayout
      title={{ id: 'Cara Mengundang Keluarga ke JiaJian Log', zh: '如何邀請家人使用家健錄', en: 'How to invite family to JiaJian Log' }}
      sourceNote={{ id: 'Sumber: fitur undangan keluarga JiaJian Log · Diperbarui 2026-09-06', zh: '資料來源：家健錄家庭邀請功能 · 更新日期 2026-09-06', en: 'Source: JiaJian Log family invitation feature · Updated 2026-09-06' }}
      metaDescription={{
        id: 'Panduan langkah demi langkah untuk mengundang orang yang dirawat atau anggota keluarga sebagai pengasuh di JiaJian Log.',
        zh: '一步一步說明如何在家健錄邀請被照顧者本人，或邀請兄弟姐妹成為照護者。',
        en: 'Step-by-step instructions for inviting a patient or a family member caregiver in JiaJian Log.',
      }}
    >
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-950">
        {text({
          id: 'Ada dua jenis undangan. Pilih yang sesuai: orang yang dirawat masuk untuk mengonfirmasi identitasnya sendiri, atau anggota keluarga masuk untuk membantu merawat pasien yang sudah ada.',
          zh: '家健錄有兩種邀請，請先選對：被照顧者本人登入確認自己的身分，或是家人登入後協助照護已存在的病人。',
          en: 'There are two invitation types: the patient signs in to confirm their own identity, or a family member signs in to help care for an existing patient.',
        })}
      </div>

      <GuideSection title={{ id: 'A. Mengundang orang yang dirawat itu sendiri', zh: 'A. 邀請被照顧者本人', en: 'A. Invite the patient themselves' }}>
        <p>{text({ id: 'Gunakan ini saat Anda ingin membuat akun pasien untuk ibu, ayah, atau anggota keluarga yang akan menjadi pemilik identitas pasiennya sendiri.', zh: '如果要替媽媽、爸爸或家人建立「他／她本人」的被照顧者身分，請使用這個流程。', en: 'Use this when creating a patient account for a parent or family member who will own their own patient identity.' })}</p>
        <GuideList items={[
          { id: 'Masuk ke aplikasi dengan akun pengelola keluarga, buka Pengaturan, lalu pilih undangan orang yang dirawat.', zh: '用家庭管理者帳號登入，打開「設定」，找到邀請被照顧者本人。', en: 'Sign in with the family owner account, open Settings, and choose the patient invitation.' },
          { id: 'Isi nama, alamat Google Email orang tersebut, dan alasan kewenangan. Tekan buat undangan.', zh: '填寫名稱、對方的 Google Email 與授權依據，按下建立邀請。', en: 'Enter the name, the person’s Google email, and the authorization basis, then create the invitation.' },
          { id: 'Jika email belum dikonfigurasi atau gagal, tekan Bagikan atau Salin tautan untuk mengirim tautan secara manual.', zh: '如果 email 尚未設定或寄送失敗，請按「系統分享」或「複製連結」手動傳送。', en: 'If email is not configured or delivery fails, choose Share or Copy link to send it manually.' },
          { id: 'Orang tersebut membuka tautan, masuk dengan Google Email yang sama, lalu menerima undangan di halaman konfirmasi.', zh: '對方開啟連結，用相同的 Google Email 登入，再到確認頁接受邀請。', en: 'The person opens the link, signs in with the same Google email, and accepts the invitation on the confirmation page.' },
        ]} />
        <p className="rounded-xl bg-emerald-50 p-3 text-emerald-950">{text({ id: 'Sebelum orang tersebut menerima undangan, belum ada akses catatan kesehatan. Tautan yang belum digunakan dapat dicabut dari daftar undangan.', zh: '在對方接受前，不會開通健康紀錄權限；尚未使用的連結可在邀請清單中撤銷。', en: 'No health-record access exists before the person accepts. Unused links can be revoked from the invitation list.' })}</p>
      </GuideSection>

      <GuideSection title={{ id: 'B. Mengundang saudara untuk membantu merawat', zh: 'B. 邀請兄弟姐妹一起照護', en: 'B. Invite family to help with care' }}>
        <p>{text({ id: 'Gunakan ini untuk saudara, pengasuh, atau anggota keluarga yang sudah memiliki akun sendiri dan hanya perlu membantu melihat atau mencatat pasien tertentu.', zh: '如果要邀請兄弟姐妹、看護或其他已有自己帳號的家人，讓對方協助查看或記錄特定病人，請使用這個流程。', en: 'Use this for a sibling, caregiver, or family member with their own account who needs to view or record a specific patient.' })}</p>
        <GuideList items={[
          { id: 'Di Pengaturan, buka Undang keluarga untuk merawat, pilih satu pasien, dan isi Google Email penerima.', zh: '在「設定」打開「邀請家人一起照護」，選一位病人並填寫受邀者的 Google Email。', en: 'In Settings, open Invite family to help with care, choose a patient, and enter the recipient’s Google email.' },
          { id: 'Pilih izin secara terpisah: lihat data, catat data, dan ubah rencana obat. Izin catat dan obat awalnya mati.', zh: '分開選擇「查看資料」、「記錄資料」與「調整藥單」；記錄與藥單權限預設關閉。', en: 'Choose permissions separately: view data, record data, and change the medication plan. Recording and medication permissions start off.' },
          { id: 'Tekan kirim undangan. Jika email belum dikonfigurasi atau gagal, gunakan tautan yang ditampilkan untuk berbagi manual. Jangan mengirim foto layar yang berisi data kesehatan.', zh: '按「送出邀請」。如果 email 尚未設定或寄送失敗，請用畫面上的連結手動分享；不要用含健康資料的截圖代替邀請連結。', en: 'Send the invitation. If email is not configured or delivery fails, use the displayed link for manual sharing. Do not send screenshots containing health data.' },
          { id: 'Orang yang menerima email atau tautan masuk dengan Google. Ia juga dapat melihat undangan yang ditujukan kepadanya langsung di halaman awal, lalu mengajukan permintaan. Ia belum dapat melihat pasien sampai pengelola mengonfirmasi.', zh: '對方收到 email 或連結後用 Google 登入；也可以直接在首頁看到指定給自己的邀請並提出申請。家庭管理者確認前，對方看不到該病人。', en: 'The recipient signs in with Google from the email or link. They can also see their targeted invitation on the home screen and request access; they cannot see the patient until the owner approves.' },
          { id: 'Kembali ke Pengaturan, cari status Menunggu konfirmasi, lalu pilih Konfirmasi akun.', zh: '回到「設定」，找到「等待管理者確認」，按「確認帳號並加入」。', en: 'Return to Settings, find Waiting for owner approval, and choose Approve account and add.' },
        ]} />
        <p className="rounded-xl bg-amber-50 p-3 text-amber-950">{text({ id: 'Jika izin sudah diberikan, cabut akses pasien dari undangan yang berstatus aktif. Mencabut undangan yang belum dikonfirmasi adalah tindakan yang berbeda.', zh: '如果對方已加入，要從已啟用的邀請操作「撤銷此病人權限」；撤銷尚未確認的邀請是另一個按鈕。', en: 'After access is granted, revoke patient access from the active invitation. Revoking an unapproved invitation is a separate action.' })}</p>
      </GuideSection>

      <GuideSection title={{ id: 'Perbedaan yang paling penting', zh: '最容易搞混的差別', en: 'The most important difference' }}>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-gray-50 text-gray-800">
              <tr>
                <th className="p-3 font-bold">{text({ id: 'Pertanyaan', zh: '問題', en: 'Question' })}</th>
                <th className="p-3 font-bold">{text({ id: 'Orang yang dirawat', zh: '被照顧者本人', en: 'Patient' })}</th>
                <th className="p-3 font-bold">{text({ id: 'Anggota keluarga', zh: '家人照護者', en: 'Family caregiver' })}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr><th className="p-3 font-semibold text-gray-700">{text({ id: 'Apa yang dikonfirmasi?', zh: '確認什麼？', en: 'What is confirmed?' })}</th><td className="p-3">{text({ id: 'Identitas pasien sendiri', zh: '本人被照顧者身分', en: 'The patient’s own identity' })}</td><td className="p-3">{text({ id: 'Permintaan membantu pasien tertentu', zh: '協助特定病人的申請', en: 'A request to help a specific patient' })}</td></tr>
              <tr><th className="p-3 font-semibold text-gray-700">{text({ id: 'Jalur masuk', zh: '入口', en: 'Entry route' })}</th><td className="p-3">/patient-invite</td><td className="p-3">/join</td></tr>
              <tr><th className="p-3 font-semibold text-gray-700">{text({ id: 'Siapa yang menyetujui?', zh: '誰確認？', en: 'Who approves?' })}</th><td className="p-3">{text({ id: 'Orang yang diundang', zh: '受邀本人', en: 'The invited person' })}</td><td className="p-3">{text({ id: 'Pengelola keluarga', zh: '家庭管理者', en: 'The family owner' })}</td></tr>
            </tbody>
          </table>
        </div>
      </GuideSection>

      <GuideSection title={{ id: 'Jika tautan tidak bekerja', zh: '如果連結不能使用', en: 'If the link does not work' }}>
        <GuideList items={[
          { id: 'Pastikan masuk dengan Google Email yang menerima undangan. Email lain akan ditolak.', zh: '確認用受邀的 Google Email 登入；使用其他 Email 會被拒絕。', en: 'Sign in with the Google email that received the invitation. Other emails are rejected.' },
          { id: 'Tautan hanya berlaku selama tujuh hari dan hanya dapat digunakan sesuai status undangan.', zh: '連結有效七天，且只能依邀請目前狀態使用。', en: 'The link is valid for seven days and only works according to the invitation status.' },
          { id: 'Minta pengelola membuat tautan baru jika tautan sudah kedaluwarsa atau dicabut.', zh: '如果連結已過期或被撤銷，請家庭管理者重新建立邀請。', en: 'Ask the family owner to create a new link if it has expired or been revoked.' },
          { id: 'Jika tombol salin tidak bekerja di ponsel, tekan lama kotak tautan untuk menyalinnya secara manual.', zh: '如果手機無法自動複製，請長按連結欄位手動複製。', en: 'If copying does not work on a phone, press and hold the link field to copy it manually.' },
        ]} />
      </GuideSection>
    </ContentGuideLayout>
  )
}
