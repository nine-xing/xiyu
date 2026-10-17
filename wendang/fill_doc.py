# -*- coding: utf-8 -*-
"""只改文本不改格式，一页一事，底部居中页码，目录罗马数字"""
from docx import Document
from lxml import etree
import copy, re

SRC = 'E:/xiyu/wendang/动漫社的我们.docx'
DST = 'E:/xiyu/wendang/动漫社的我们_补全.docx'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

HERO = {"title":"未命名的","titleAccent":"纪行","lead":"将招新、比赛与日常，收进同一卷磁带。向下滚动，逐幕回放。"}

ALL = [
    ("2025-05-25","社团大会 tk（汐遇前身）","2025年5月25日19:10开会，颁奖（KFC联动奖项）。社长讲解下次活动内容及注意事项，社团内小活动安排，公众号各平台运营，看板娘优化。各组代表发言：刘旭、黄梓濠、张涛、龚睿曦、刘秋玲。社长分享三次元经历及对社员的点评。40人。第1次也是最后一次tk社团大会。", True),
    ("2025-05-28","社团联合会 tk（汐遇前身）","5月28日南院舞厅。开展社团联合会，出席者有两位学姐、1+1、小孢奈、灵秋、安静、摆烂仙贝、日春梦。提前一个多月练习宅舞，跨越校区训练，路程遥远。有几人第一次接触宅舞，过程艰难但无人放弃。最终表演人数及观众均为所有社团最多，活动非常成功，证明二次元群体凝聚力强且勇敢。", False),
    ("2025-10-12","南院招新摆台","南院摆台招新开始，社长、副社、各组组长及热心社员拿出收藏的周边手办等物品来展览，体现动漫社的和睦与团结的气氛。", False),
    ("2025-10-15","南院走班招新","南院下班招新，多位cos老师组成走班招新团。社团领导在讲台宣传，社员在台下cos展示并分发社团小卡，让新生了解动漫社、感受大家的热情。", False),
    ("2025-10-16","北院走班招新","北院走班招新，小圆、阿渔、白昼梦、苏浅浅、企鹅饼、小橘、1+1、灵秋、孢奈、楠尘、486、锦言等人参加。戴着闷热的假发走很远路程，在苏浅浅、486、1+1及俊哲学长带领下走遍每个晚自习教室。两天共32人。", False),
    ("2025-10-23","南院正式招新摆台","正式南院招新摆台。今天来的人意外多，尤其在临近晚饭时分，社员认真热情对待每位学生，cos老师帮忙招新。热闹氛围持续到结束。", False),
    ("2025-10-24","北院招新摆台","北院招新摆台。虽无cos老师但帮忙社员只多不少，还有三国杀活动。来摊位了解社团的学生不少，轻松愉快中时间流逝。", False),
    ("2025-10-26","社团招新考核","新学期招新考试，北院软件学院阶梯教室一。1+1（音研组）、巫妄（游戏组）、漫研组、灵秋（表演组）、企鹅饼（cos组）、486（平面组）、孢奈（策划组）代表发言。浅浅社长讲述社团作用及个人经历。前十名到场有小奖励。到场137人，圆满成功。", False),
    ("2025-10-30","看板娘测试","看板娘私聊及群聊功能测试，技术实现靠南玖和浅浅。私聊征集5名志愿者，群聊在cos组发布测试版。总体非常活跃气氛，效果很好。", False),
    ("2025-11-08","青空动漫展","与渔乐社联合出展青空漫展，为日后单独出展汲取经验。7号晚社长、副社、前社长、白昼梦、史官帮忙摆台。因经验不足上报实体票时间晚了，辛苦渔乐社社长帮助调节。8号看到渔乐社运营实力，了解自身不足，积累了宝贵经验。促进了社员感情，让社团更加团结。", False),
    ("2025-11-09","第一次社团大会","25届第一次社团大会，北院软件学院阶梯教室二。新生参与感强、意愿大。1+1介绍活动预热，486详述活动展开及时间安排。初代目浅浅社长回顾社团历史，表扬大家活力。不足：通知不到位导致多人匆忙从家赶回，感谢新人们重视社团第一次会议。", True),
    ("2025-12-10","南院路演（晚自习下课后）","动漫社与其他社团联合路演，到场人数多。虽因电力故障终止，但每个节目都展示了幕后辛勤练习，让人下定决心让下次活动更完美。", False),
    ("2025-12-14","第二次社团大会","宣发萌卡漫展等校外活动及校内晚会。学校不批经费，发起非强制募捐。本学期校外参展3个，校内1次联合路演。2026年计划借晚会联社团、多参漫展，扩大社团规模。", True),
    ("2025-12-18","南院社团联谊晚会","汐遇动漫社首次校园大活动，抖音平台直播。有宅舞、双人舞、歌曲等节目，现场氛围极好。感谢每位表演社员在幕后的巨大付出，也感谢现场主持和帮忙的社员们。", False),
    ("2026-01-01","萌卡动漫展（汐遇首展）","经1个多月准备，1月1日开始萌卡摊位展览。31日布展。1.1多亏企鹅饼及工作人员努力，晚上茄饼培训。1.2凭第一天经验顺利应对。1.3游客减少但应对自如。改名汐遇后首场漫展效果很好，积累了宝贵经验。", False),
    ("2026-03-22","26年上学期第一次社团大会","介绍tk（2014年韩政创立）到汐遇（2025年苏浅等人改名）的历史。后续活动：梦华、萌卡、卫戍杯、社团联合会。小组变动：音研组→轻音组，策划组→秘书处。实到59人。", True),
    ("2026-04-26","汐遇第二次大会","北院软件学院阶一教室。1+1：学习通打卡、萌卡预热宣发、晚会预告、闭幕式及社联。486：到会人数少、接班问题、萌卡买票、假条练舞问题。灵秋希望大家积极参与节目。到场50人。", True),
    ("2026-05-01","汐遇51萌卡漫展","4天漫展！4月31日布展。51当天极热闹，486、灵秋、刘旭及茄饼老师助力，第一天获最好玩的社团奖。5.2人流量稍减仍满满，很多人来玩小游戏。后两天史官因故未到场。", False),
    ("2026-05-14","汐遇动漫社社团活动","近两个月筹备后拉开帷幕，参与71人。节目：（1）夏目沧明/立希/三里《甩手当老板》、（2）喵呜薄荷《寄明月》、（3）xyao《繁星坠海》、（4）灵秋《catch me！》、（5）许川/雨辞《Music light Quest》、（6）海盐焦糖精《满怀爱意的接近中》、（7）白昼梦/喵呜薄荷《白金disco》《抚摸抚摸》、（8）taki《春日影》、（9）君清《勾指起誓》、（10）灵秋/海盐焦糖精《make it》、（11）途中妄归乐器solo+《改变自己》+《Lost one的号哭》。活动圆满，实到46人。", False),
]

def guess_location(text):
    for m in ["北院软件学院阶梯教室二","北院软件学院阶梯教室一","北院软件学院阶一教室",
              "北院软件211班","南院舞厅","南院","北院"]:
        if m in text: return m
    return ""

def guess_count(text):
    m = re.search(r'(?:实到|到场|出席|共)\s*(\d+)\s*人|(\d+)人\s*Aa', text)
    if m: return (m.group(1) or m.group(2)) + "人"
    m = re.search(r'人数[^0-9]*(\d+)', text)
    if m: return m.group(1) + "人"
    return ""

def w(tag): return '{' + W + '}' + tag
def ptext(el): return ''.join(el.itertext()).strip()
def clone(el): return copy.deepcopy(el)

def add_page_break_before(para_el):
    pPr = para_el.find(w('pPr'))
    if pPr is None: pPr = etree.SubElement(para_el, w('pPr'))
    if pPr.find(w('pageBreakBefore')) is None:
        etree.SubElement(pPr, w('pageBreakBefore'))

def set_center(para_el):
    pPr = para_el.find(w('pPr'))
    if pPr is None: pPr = etree.SubElement(para_el, w('pPr'))
    jc = pPr.find(w('jc'))
    if jc is None: jc = etree.SubElement(pPr, w('jc'))
    jc.set(w('val'), 'center')

def new_para_from(tmpl, text):
    p = clone(tmpl)
    runs = list(p.iter(w('r')))
    for r in runs[1:]:
        parent = r.getparent()
        if parent is not None: parent.remove(r)
    if runs:
        t_els = list(runs[0].iter(w('t')))
        for wt in t_els: wt.text = ''
        if t_els:
            t_els[0].text = text
            if '\n' in text:
                try: t_els[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                except: pass
    return p

def display_width(s):
    w = 0
    for c in s:
        if '一' <= c <= '鿿' or '　' <= c <= '〿' or '＀' <= c <= '￯':
            w += 2
        else:
            w += 1
    return w


print("Loading...")
doc = Document(SRC)
body = doc.element.body
all_p = list(body.findall(w('p')))
print(f"Total: {len(all_p)} paragraphs")

def locate(substr, start=0):
    for i in range(start, len(all_p)):
        if substr in ptext(all_p[i]): return i
    return None

idx_fw  = locate('前言')
idx_toc = locate('社团的大会及活动')
idx_xb  = locate('我们社团の仙贝们')
idx_xb2 = locate('记录人：张涛')
idx_mt  = locate('第 次社团大会')
idx_xr  = locate('社团の先人们')
idx_cd  = locate('初代目', idx_xr or 0)

tmpl_meet_title = all_p[idx_mt]
tmpl_meet_field = all_p[idx_mt+1]
tmpl_empty = None
for i in range(idx_xb2+2, idx_mt):
    if not ptext(all_p[i]): tmpl_empty = all_p[i]; break
if tmpl_empty is None: tmpl_empty = all_p[idx_xb2+2]

tmpl_pn = None
for i in range(len(all_p)-1, idx_xr, -1):
    el = all_p[i]
    if not list(el.findall(w('r'))): continue
    t = ptext(el)
    if t.isdigit() and len(t) <= 3:
        tmpl_pn = el; print(f"页码模板 P{i}: '{t}'"); break
if tmpl_pn is None:
    tmpl_pn = tmpl_meet_field; print("页码模板 fallback: meet_field")

xianbei_block = all_p[idx_xb:idx_xb2+3]
xianren_block = all_p[idx_xr:idx_cd+5]

foreword_text = (f"《汐遇动漫社》——{HERO['title']}{HERO['titleAccent']}\n\n"
                 f"{HERO['lead']}\n\n"
                 f"本书记录汐遇动漫社（前身tk动漫社）自2025年5月创立以来的"
                 f"每一次社团大会、招新活动、漫展参展、校内演出等精彩瞬间。"
                 f"每一页都是社员们汗水与热爱的见证。\n\n"
                 f"记录人：张涛（史官）\n始自：2025年5月25日")

old_rest = list(body.findall(w('p')))[48:]
print(f"Removing {len(old_rest)} paragraphs from P48...")
for el in old_rest:
    parent = el.getparent()
    if parent is not None:
        parent.remove(el)

cur = list(body.findall(w('p')))
for offset in range(1, 10):
    pi = idx_fw + offset
    if pi >= len(cur): break
    if not ptext(cur[pi]):
        body.replace(cur[pi], new_para_from(cur[pi], foreword_text))
        break

toc_tmpl = all_p[48]
TARGET_W = 50
for i, evt in enumerate(ALL):
    p = clone(toc_tmpl)
    runs = list(p.iter(w('r')))
    if len(runs) >= 3:
        t0 = list(runs[0].iter(w('t')))
        for wt in t0: wt.text = ''
        if t0: t0[0].text = f"{i+1}."
        t1 = list(runs[1].iter(w('t')))
        for wt in t1: wt.text = ''
        if t1: t1[0].text = f"  {evt[1]}"
        used = display_width(f"{i+1}.  {evt[1]}")
        space_n = max(2, TARGET_W - used)
        t2 = list(runs[2].iter(w('t')))
        for wt in t2: wt.text = ''
        if t2: t2[0].text = ' ' * space_n + f"P{i+1}"
        body.append(p)
    else:
        body.append(new_para_from(toc_tmpl, f"{i+1}.  {evt[1]}  P{i+1}"))

body.append(clone(tmpl_empty))
toc_pn_el = new_para_from(tmpl_pn, 'I')
set_center(toc_pn_el)
body.append(toc_pn_el)
body.append(clone(tmpl_empty))

sp = clone(tmpl_empty); add_page_break_before(sp); body.append(sp)
for el in xianbei_block: body.append(clone(el))

for evt_idx, (date, title, text, is_meeting) in enumerate(ALL):
    pg = evt_idx + 1

    if is_meeting:
        mt = new_para_from(tmpl_meet_title, title)
        add_page_break_before(mt)
        body.append(mt)
        loc = guess_location(text); cnt = guess_count(text)
        for ft in [f"活动时间：{date}", f"活动地点：{loc}",
                   f"总参与人数：{cnt}", f"活动内容：{text}"]:
            body.append(new_para_from(tmpl_meet_field, ft))
    else:
        at = new_para_from(tmpl_meet_title, f"【{date}】{title}")
        add_page_break_before(at)
        body.append(at)
        body.append(new_para_from(tmpl_meet_field, text))

    for _ in range(15):
        body.append(clone(tmpl_empty))
    pn_el = new_para_from(tmpl_pn, str(pg))
    set_center(pn_el)
    body.append(pn_el)

print("19 events done")

sp = clone(tmpl_empty); add_page_break_before(sp); body.append(sp)
for el in xianren_block: body.append(clone(el))

for _ in range(2): body.append(clone(tmpl_empty))
program = (
    "附：2026年5月14日 社团活动完整节目单\n\n"
    "（1）夏目沧明、立希、三里——《甩手当老板》\n"
    "（2）喵呜薄荷——《寄明月》\n"
    "（3）xyao——《繁星坠海》\n"
    "（4）灵秋——《catch me！》\n"
    "（5）许川、雨辞——《Music light Quest》\n"
    "（6）海盐焦糖精——《满怀爱意的接近中》\n"
    "（7）白昼梦、喵呜薄荷——《白金disco》《抚摸抚摸》\n"
    "（8）taki——《春日影》\n"
    "（9）君清——《勾指起誓》\n"
    "（10）灵秋、海盐焦糖精——《make it》\n"
    "（11）途中妄归——乐器solo+《改变自己》+《Lost One的号哭》\n\n"
    "参与人数：71人（筹备）/ 实到：46人"
)
body.append(new_para_from(tmpl_meet_field, program))

print(f"Saving...")
doc.save(DST)
print("DONE!")
