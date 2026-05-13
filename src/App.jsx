import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabase';
import { 
  MessageCircleQuestion, Settings2, CheckCircle2, Send, 
  Users, MessageSquare, ShieldCheck, GraduationCap, X,
  ThumbsUp, HelpCircle, History, CornerDownRight, Zap, Key,
  TrendingUp, Award, Flame
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState('');
  
  const [globalState, setGlobalState] = useState({ 
    topic: '等待老师设置讨论主题...', 
    topic_id: 'default',
    allow_replies: false,
    allow_reactions: false
  });

  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);

  // ✅ 修复4/5: 抽出独立的数据刷新函数，写操作后可主动调用，不再完全依赖 Realtime
  const refreshAllData = useCallback(async () => {
    const [{ data: gState }, { data: qData }, { data: tData }] = await Promise.all([
      supabase.from('global_state').select('*').eq('id', 'main').single(),
      supabase.from('questions').select('*').order('timestamp', { ascending: false }),
      supabase.from('topics').select('*').order('timestamp', { ascending: false }),
    ]);
    if (gState) setGlobalState(gState);
    if (qData) setQuestions(qData);
    if (tData) setTopics(tData);
  }, []);

  useEffect(() => {
    setUser({ id: 'local-session' });

    const fetchInitialData = async () => {
      let { data: gState, error } = await supabase.from('global_state').select('*').eq('id', 'main').single();
      
      if (error || !gState) {
        // 初始化默认行
        const initData = { id: 'main', topic: '欢迎来到互动问答！', topic_id: 'init-' + Date.now(), allow_replies: false, allow_reactions: false };
        const { error: insertErr } = await supabase.from('global_state').upsert([initData]);
        if (!insertErr) {
          setGlobalState(initData);
          await supabase.from('topics').upsert([{ id: initData.topic_id, topic_id: initData.topic_id, title: '初始课堂记录', timestamp: Date.now() }]);
        }
      } else {
        setGlobalState(gState);
      }

      const { data: qData } = await supabase.from('questions').select('*').order('timestamp', { ascending: false });
      if (qData) setQuestions(qData);

      const { data: tData } = await supabase.from('topics').select('*').order('timestamp', { ascending: false });
      if (tData) setTopics(tData);
      
      setLoading(false);
    };

    fetchInitialData();

    // Realtime 订阅（需在 Supabase Dashboard 的 Replication 中为三张表开启）
    const channel = supabase.channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_state' }, payload => {
        if (payload.new) setGlobalState(payload.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, payload => {
        if (payload.eventType === 'INSERT') {
          setQuestions(prev => {
            // 防止乐观更新导致重复
            if (prev.some(q => q.id === payload.new.id)) return prev;
            return [payload.new, ...prev].sort((a, b) => b.timestamp - a.timestamp);
          });
        } else if (payload.eventType === 'UPDATE') {
          setQuestions(prev => prev.map(q => q.id === payload.new.id ? payload.new : q));
        } else if (payload.eventType === 'DELETE') {
          setQuestions(prev => prev.filter(q => q.id !== payload.old.id));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'topics' }, payload => {
        setTopics(prev => {
          if (prev.some(t => t.id === payload.new.id)) return prev;
          return [payload.new, ...prev].sort((a, b) => b.timestamp - a.timestamp);
        });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') console.log('✅ Realtime 连接成功');
        if (status === 'CHANNEL_ERROR') console.warn('⚠️ Realtime 连接失败，请检查 Supabase 后台 Replication 设置');
      });

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleStatusChange = async (qId, newStatus) => {
    const { error } = await supabase.from('questions').update({ status: newStatus }).eq('id', qId);
    if (error) {
      console.error('状态更新失败:', error);
      alert('操作失败：' + error.message);
    }
  };

  const currentQuestions = useMemo(() => {
    return questions.filter(q => q.topic_id === globalState.topic_id);
  }, [questions, globalState.topic_id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center text-gray-500">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        连接教学系统中...
      </div>
    </div>
  );

  if (!role) {
    return <RoleSelection onSelect={(r, name) => { setRole(r); setUserName(name); }} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <MessageCircleQuestion className="w-6 h-6 text-indigo-600" />
            <h1 className="text-xl font-bold text-slate-800">同步教学互动</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-100 rounded-full text-sm">
              {role === 'teacher' ? <ShieldCheck className="w-4 h-4 text-indigo-600" /> : <GraduationCap className="w-4 h-4 text-emerald-600" />}
              <span className="font-medium">{userName} ({role === 'teacher' ? '教师' : '学生'})</span>
            </div>
            <button onClick={() => setRole(null)} className="text-sm text-slate-500 hover:text-slate-700">退出</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {role === 'teacher' ? (
          <TeacherDashboard 
            globalState={globalState}
            setGlobalState={setGlobalState}  // ✅ 修复4: 传入 setter 供子组件乐观更新
            questions={questions}
            setQuestions={setQuestions}       // ✅ 修复5: 传入 setter 供子组件乐观更新
            currentQuestions={currentQuestions}
            topics={topics}
            setTopics={setTopics}
            onStatusChange={handleStatusChange}
            onRefresh={refreshAllData}        // ✅ 修复4/5: 写操作后主动刷新的降级方案
          />
        ) : (
          <StudentDashboard 
            user={user} 
            userName={userName} 
            globalState={globalState} 
            questions={currentQuestions}
            setQuestions={setQuestions}       // ✅ 修复5: 乐观更新
            onStatusChange={handleStatusChange}
            onRefresh={refreshAllData}
          />
        )}
      </main>
    </div>
  );
}

// ==========================================
// 1. 身份选择组件
// ==========================================
function RoleSelection({ onSelect }) {
  const [name, setName] = useState('');
  const [showTeacherAuth, setShowTeacherAuth] = useState(false);
  const [pwdInput, setPwdInput] = useState('');
  const [isSettingPwd, setIsSettingPwd] = useState(false);

  useEffect(() => {
    if (showTeacherAuth) {
      const savedPwd = localStorage.getItem('admin_pwd');
      if (!savedPwd) setIsSettingPwd(true);
      else setIsSettingPwd(false);
    }
  }, [showTeacherAuth]);

  const handleStudentJoin = () => {
    if (!name.trim()) return alert("请输入您的真实姓名参与互动");
    onSelect('student', name.trim());
  };

  const handleTeacherJoin = () => {
    if (!pwdInput.trim()) return alert("密码不能为空");
    if (isSettingPwd) {
      localStorage.setItem('admin_pwd', pwdInput);
      onSelect('teacher', '教师');
    } else {
      const savedPwd = localStorage.getItem('admin_pwd');
      if (savedPwd === pwdInput) {
        onSelect('teacher', '教师');
      } else {
        alert('管理密码错误');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-emerald-50 p-4 relative">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">进入互动课堂</h2>
          <p className="text-slate-500 mt-2 text-sm">此互动要求实名参与，请如实填写</p>
        </div>
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">真实姓名</label>
            <input 
              type="text" value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStudentJoin()}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all outline-none"
              placeholder="请输入姓名"
            />
          </div>
          <button onClick={handleStudentJoin} className="w-full py-3.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
            加入课堂
          </button>
        </div>
      </div>

      <div className="absolute bottom-6 w-full text-center">
        {!showTeacherAuth ? (
          <button onClick={() => setShowTeacherAuth(true)} className="text-xs text-slate-300 hover:text-slate-500 transition-colors">管理入口</button>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2 bg-white/80 p-4 rounded-xl backdrop-blur-sm border border-slate-200">
            <div className="text-xs font-medium text-slate-600 flex items-center">
              <Key className="w-3 h-3 mr-1" />
              {isSettingPwd ? "首次使用，请设置本机管理密码" : "请输入管理密码"}
            </div>
            <div className="flex items-center space-x-2">
              <input type="password" value={pwdInput} onChange={e => setPwdInput(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && handleTeacherJoin()}
                placeholder={isSettingPwd ? "设置新密码" : "输入密码"} 
                className="px-3 py-1.5 rounded border border-slate-300 text-sm outline-none focus:border-indigo-500 w-32" />
              <button onClick={handleTeacherJoin} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 transition-colors">
                {isSettingPwd ? "设置并进入" : "进入"}
              </button>
              <button onClick={() => setShowTeacherAuth(false)} className="px-2 py-1 text-slate-400 hover:text-slate-600 text-sm"><X className="w-4 h-4"/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 2. 教师端控制台
// ==========================================
function TeacherDashboard({ globalState, setGlobalState, questions, setQuestions, currentQuestions, topics, setTopics, onStatusChange, onRefresh }) {
  const [activeTab, setActiveTab] = useState('control');
  
  const maxConfusions = useMemo(() => {
    return currentQuestions.reduce((max, q) => Math.max(max, (q.confused_by || []).length), 0);
  }, [currentQuestions]);

  return (
    <div className="space-y-6">
      <div className="flex space-x-2 border-b border-slate-200">
        <TabButton active={activeTab === 'control'} onClick={() => setActiveTab('control')} icon={<Settings2 className="w-4 h-4 mr-2"/>}>当前课堂控制</TabButton>
        <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History className="w-4 h-4 mr-2"/>}>数据回看与分析</TabButton>
      </div>
      {activeTab === 'control' ? (
        <TeacherControlPanel 
          globalState={globalState}
          setGlobalState={setGlobalState}
          currentQuestions={currentQuestions}
          onStatusChange={onStatusChange}
          maxConfusions={maxConfusions}
          onRefresh={onRefresh}
          setTopics={setTopics}
        />
      ) : (
        <TeacherHistoryPanel topics={topics} allQuestions={questions} />
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button onClick={onClick} className={`flex items-center px-6 py-3 font-medium text-sm border-b-2 transition-colors ${active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}>
      {icon} {children}
    </button>
  );
}

function TeacherControlPanel({ globalState, setGlobalState, currentQuestions, onStatusChange, maxConfusions, onRefresh, setTopics }) {
  const [editTopic, setEditTopic] = useState(globalState.topic);
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  // ✅ 修复2: editTopic 与 globalState.topic 保持同步（当 Realtime 更新时跟着更新）
  useEffect(() => {
    setEditTopic(globalState.topic);
  }, [globalState.topic]);

  const handleSaveTopic = async () => {
    if (!editTopic.trim()) return;
    setSaving(true);
    const newTopicId = 'topic-' + Date.now();
    
    const { error: stateErr } = await supabase.from('global_state')
      .update({ topic: editTopic.trim(), topic_id: newTopicId, allow_replies: false, allow_reactions: false })
      .eq('id', 'main');
    
    if (stateErr) {
      console.error('发布话题失败:', stateErr);
      alert('发布失败：' + stateErr.message);
      setSaving(false);
      return;
    }

    const newTopicRow = { id: newTopicId, topic_id: newTopicId, title: editTopic.trim(), timestamp: Date.now() };
    const { error: topicErr } = await supabase.from('topics').insert([newTopicRow]);
    if (topicErr) console.warn('话题历史记录写入失败:', topicErr);

    // ✅ 修复4: 乐观更新本地状态，不等待 Realtime
    setGlobalState(prev => ({ ...prev, topic: editTopic.trim(), topic_id: newTopicId, allow_replies: false, allow_reactions: false }));
    setTopics(prev => [newTopicRow, ...prev]);

    setSaving(false);
    alert("新问题发布成功，旧问题已自动归档！");
  };

  const toggleSetting = async (field) => {
    const newValue = !globalState[field];
    
    const { error } = await supabase.from('global_state')
      .update({ [field]: newValue })
      .eq('id', 'main');
    
    if (error) {
      console.error(`切换 ${field} 失败:`, error);
      alert('操作失败：' + error.message);
      return;
    }

    // ✅ 修复4: 乐观更新，开关立即响应，不依赖 Realtime
    setGlobalState(prev => ({ ...prev, [field]: newValue }));
  };

  const filteredQuestions = useMemo(() => {
    if (filter === 'all') return currentQuestions;
    return currentQuestions.filter(q => q.status === filter);
  }, [currentQuestions, filter]);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold flex items-center mb-4"><Settings2 className="w-5 h-5 mr-2 text-indigo-500" /> 发布新讨论与权限</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="md:col-span-2 space-y-3">
            <label className="text-sm font-medium text-slate-600">当前抛出的问题 / 主题</label>
            <div className="flex gap-2">
              <input 
                type="text" value={editTopic} 
                onChange={e => setEditTopic(e.target.value)} 
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" 
              />
              <button 
                onClick={handleSaveTopic} 
                disabled={saving || !editTopic.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap text-sm disabled:opacity-50"
              >
                {saving ? '发布中...' : '发布并归档'}
              </button>
            </div>
          </div>
          <div className="space-y-3 border-l border-slate-100 pl-6">
            <label className="text-sm font-medium text-slate-600 block">允许学生跟帖回复</label>
            <Switch active={globalState.allow_replies} onClick={() => toggleSetting('allow_replies')} />
            <p className="text-xs text-slate-400">{globalState.allow_replies ? '✅ 已开启' : '🔒 已关闭'}</p>
          </div>
          <div className="space-y-3 border-l border-slate-100 pl-6">
            <label className="text-sm font-medium text-slate-600 flex items-center">开启共鸣与点赞 <Zap className="w-4 h-4 ml-1 text-amber-500"/></label>
            <Switch active={globalState.allow_reactions} onClick={() => toggleSetting('allow_reactions')} />
            <p className="text-xs text-slate-400">{globalState.allow_reactions ? '✅ 已开启' : '🔒 已关闭'}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between mb-4 gap-4">
              <h2 className="text-lg font-semibold flex items-center">
                <Users className="w-5 h-5 mr-2 text-indigo-500" /> 当前问题池 <span className="ml-2 text-sm font-normal text-slate-500">共 {currentQuestions.length} 条</span>
              </h2>
              <div className="flex space-x-2 bg-slate-100 p-1 rounded-lg">
                {['all', 'unresolved', 'resolved'].map(f => (
                  <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-sm rounded-md transition-colors ${filter === f ? 'bg-white shadow-sm text-indigo-700 font-medium' : 'text-slate-600'}`}>
                    {f === 'all' ? '全部' : f === 'unresolved' ? '未解决' : '已解决'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {filteredQuestions.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-sm">当前主题暂无数据</p>
              ) : (
                filteredQuestions.map(q => <QuestionItem key={q.id} question={q} isTeacher={true} onStatusChange={onStatusChange} maxConfusions={maxConfusions} globalState={globalState} />)
              )}
            </div>
          </div>
        </div>
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 sticky top-20">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-indigo-500"/> 热度排行</h3>
            <TrendingQuestionsChart questions={currentQuestions} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Switch({ active, onClick }) {
  return (
    <button 
      onClick={onClick} 
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${active ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function TeacherHistoryPanel({ topics, allQuestions }) {
  const [selectedTopicId, setSelectedTopicId] = useState('');

  const mergedTopics = useMemo(() => {
    const tMap = new Map(topics.map(t => [t.topic_id, t]));
    allQuestions.forEach(q => {
      if (q.topic_id && !tMap.has(q.topic_id)) {
        tMap.set(q.topic_id, { id: q.topic_id, topic_id: q.topic_id, title: '未归档的早期记录', timestamp: q.timestamp || 0 });
      }
    });
    return Array.from(tMap.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [topics, allQuestions]);

  useEffect(() => {
    if (mergedTopics.length > 0 && !selectedTopicId) setSelectedTopicId(mergedTopics[0].topic_id);
  }, [mergedTopics, selectedTopicId]);

  const histQuestions = useMemo(() => {
    return allQuestions.filter(q => q.topic_id === selectedTopicId);
  }, [allQuestions, selectedTopicId]);

  return (
    <div className="grid md:grid-cols-3 gap-6 animate-in fade-in">
      <div className="md:col-span-1 space-y-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center"><History className="w-4 h-4 mr-2" /> 历史课堂记录</h3>
          {mergedTopics.length === 0 ? <p className="text-sm text-slate-400">暂无历史记录</p> : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {mergedTopics.map(t => (
                <div key={t.id} onClick={() => setSelectedTopicId(t.topic_id)} className={`p-3 rounded-xl cursor-pointer transition-colors border text-sm ${selectedTopicId === t.topic_id ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                  <div className="font-medium text-slate-800 truncate mb-1" title={t.title}>{t.title}</div>
                  <div className="text-xs text-slate-500">{new Date(t.timestamp).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="md:col-span-2 space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-indigo-500" /> 学生关注焦点 Top 5</h3>
          <TrendingQuestionsChart questions={histQuestions} />
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-4 border-b pb-2">具体提问与互动明细 ({histQuestions.length}条)</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {histQuestions.length === 0 ? <p className="text-sm text-slate-400">暂无提问数据</p> : 
              histQuestions.map(q => <QuestionItem key={q.id} question={q} isTeacher={true} readonly={true} globalState={{}} />)
            }
          </div>
        </div>
      </div>
    </div>
  );
}

function TrendingQuestionsChart({ questions }) {
  const sorted = useMemo(() => {
    return [...questions].map(q => ({
      ...q,
      heat: (q.confused_by?.length || 0) + (q.replies?.length || 0)
    })).sort((a, b) => b.heat !== a.heat ? b.heat - a.heat : b.timestamp - a.timestamp).slice(0, 5);
  }, [questions]);

  if (sorted.length === 0) return <div className="h-24 flex items-center justify-center text-slate-400 text-sm bg-slate-50 rounded-xl">暂无学生互动数据</div>;
  const maxHeat = sorted[0].heat > 0 ? sorted[0].heat : 1;

  return (
    <div className="space-y-5 p-2">
      {sorted.map((q, idx) => (
        <div key={q.id} className="relative">
          <div className="flex justify-between items-end mb-1">
            <div className="flex items-center space-x-2 max-w-[80%]">
              <span className={`font-bold text-sm ${idx===0?'text-rose-500':idx===1?'text-amber-500':idx===2?'text-emerald-500':'text-slate-400'}`}>#{idx + 1}</span>
              <span className="text-sm text-slate-700 truncate" title={q.text}>{q.text}</span>
            </div>
            <span className="text-xs font-medium text-slate-500 flex items-center"><Flame className="w-3 h-3 text-orange-400 mr-1"/> 热度: {q.heat}</span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-400 to-indigo-600 h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${(q.heat / maxHeat) * 100}%` }}></div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==========================================
// 3. 学生端组件
// ==========================================
function StudentDashboard({ user, userName, globalState, questions, setQuestions, onStatusChange, onRefresh }) {
  const [newQuestion, setNewQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleAsk = async () => {
    if (!newQuestion.trim() || submitting) return;
    setSubmitting(true);

    // ✅ 修复3: 使用 crypto.randomUUID() 生成合法 UUID，避免与 Supabase 主键类型冲突
    const qData = {
      id: crypto.randomUUID(),
      topic_id: globalState.topic_id,
      text: newQuestion.trim(),
      author_name: userName,
      author_id: userName,
      status: 'unresolved',
      timestamp: Date.now(),
      replies: [],
      confused_by: []
    };

    const { error } = await supabase.from('questions').insert([qData]);
    
    if (error) {
      console.error('提交问题失败:', error);
      alert('提交失败：' + error.message);
      setSubmitting(false);
      return;
    }

    // ✅ 修复5: 乐观更新——提交成功后立即显示，不等待 Realtime
    setQuestions(prev => {
      if (prev.some(q => q.id === qData.id)) return prev;
      return [qData, ...prev];
    });
    setNewQuestion('');
    setSubmitting(false);
  };

  const maxConfusions = useMemo(() => {
    return questions.reduce((max, q) => Math.max(max, (q.confused_by || []).length), 0);
  }, [questions]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-indigo-600 to-blue-500 rounded-2xl p-6 shadow-md text-white">
        <h2 className="text-indigo-100 text-sm font-medium mb-2 flex items-center"><Zap className="w-4 h-4 mr-1"/> 当前讨论主题：</h2>
        <p className="text-2xl font-bold leading-relaxed">{globalState.topic}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 sticky top-20">
            <h3 className="font-medium text-slate-800 mb-3 flex items-center"><Send className="w-4 h-4 mr-2 text-indigo-500" /> 我要发言/提问</h3>
            <textarea
              rows="5" value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
              placeholder="关于今天的主题，你有什么想法或疑问？"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none mb-4 text-sm"
            />
            <button 
              onClick={handleAsk} 
              disabled={!newQuestion.trim() || submitting} 
              className="w-full py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? '提交中...' : '提交发送'}
            </button>
          </div>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="flex justify-between items-end mb-2 px-1">
            <h3 className="text-lg font-semibold text-slate-800">讨论区</h3>
            <span className="text-xs text-slate-500 bg-slate-200 px-2 py-1 rounded-full">{questions.length} 条发言</span>
          </div>
          <div className="space-y-5">
            {questions.length === 0 ? (
              <div className="bg-white p-12 rounded-2xl text-center border border-slate-200 text-slate-400">暂无同学发言，快来抢沙发！</div>
            ) : (
              questions.map(q => (
                <QuestionItem 
                  key={q.id} question={q} isTeacher={false} 
                  currentUserId={userName} currentUserName={userName} 
                  globalState={globalState} onStatusChange={onStatusChange} 
                  maxConfusions={maxConfusions}
                  setQuestions={setQuestions}  // ✅ 修复5: 传入供回复/点赞乐观更新
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 4. 共享组件：单条问答卡片
// ==========================================
function QuestionItem({ question, isTeacher, onStatusChange, currentUserId, currentUserName, globalState, readonly, maxConfusions, setQuestions }) {
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  const isMine = !isTeacher && question.author_name === currentUserName;
  const allowReplies = globalState?.allow_replies && !isTeacher && !readonly;
  const allowReactions = globalState?.allow_reactions && !isTeacher && !readonly;
  
  const confusions = question.confused_by || [];
  const hasConfused = confusions.includes(currentUserId);
  const isPremiumQ = maxConfusions > 0 && confusions.length === maxConfusions;
  const maxLikes = question.replies?.reduce((max, r) => Math.max(max, (r.likedBy || []).length), 0) || 0;

  // ✅ 修复5: 通用的乐观更新辅助函数
  const optimisticUpdate = (updatedQuestion) => {
    if (setQuestions) {
      setQuestions(prev => prev.map(q => q.id === updatedQuestion.id ? updatedQuestion : q));
    }
  };

  const handleSubmitReply = async () => {
    if (!replyText.trim()) return;
    const newReply = {
      id: 'r-' + crypto.randomUUID(),
      text: replyText.trim(),
      authorName: currentUserName,
      authorId: currentUserId,
      timestamp: Date.now(),
      likedBy: []
    };
    const updatedReplies = [...(question.replies || []), newReply];
    
    // 乐观更新
    optimisticUpdate({ ...question, replies: updatedReplies });
    setReplyText('');
    setIsReplying(false);

    const { error } = await supabase.from('questions').update({ replies: updatedReplies }).eq('id', question.id);
    if (error) {
      console.error('回复失败:', error);
      alert('回复失败：' + error.message);
      // 回滚
      optimisticUpdate(question);
    }
  };

  const toggleConfusion = async () => {
    if (!allowReactions) return;
    let newConfused = [...confusions];
    if (hasConfused) newConfused = newConfused.filter(id => id !== currentUserId);
    else newConfused.push(currentUserId);
    
    // 乐观更新
    optimisticUpdate({ ...question, confused_by: newConfused });

    const { error } = await supabase.from('questions').update({ confused_by: newConfused }).eq('id', question.id);
    if (error) {
      console.error('共鸣操作失败:', error);
      optimisticUpdate(question); // 回滚
    }
  };

  const toggleReplyLike = async (replyId) => {
    if (!allowReactions) return;
    const updatedReplies = question.replies.map(r => {
      if (r.id === replyId) {
        let likes = r.likedBy || [];
        if (likes.includes(currentUserId)) likes = likes.filter(id => id !== currentUserId);
        else likes = [...likes, currentUserId];
        return { ...r, likedBy: likes };
      }
      return r;
    });

    // 乐观更新
    optimisticUpdate({ ...question, replies: updatedReplies });

    const { error } = await supabase.from('questions').update({ replies: updatedReplies }).eq('id', question.id);
    if (error) {
      console.error('点赞失败:', error);
      optimisticUpdate(question); // 回滚
    }
  };

  let cardStyle = "p-5 rounded-2xl border transition-all ";
  if (question.status === 'resolved') cardStyle += "bg-emerald-50/60 border-emerald-200 shadow-sm";
  else if (isPremiumQ) cardStyle += "bg-white border-amber-300 shadow-md ring-1 ring-amber-100";
  else if (isMine) cardStyle += "bg-white border-indigo-200 shadow-sm";
  else cardStyle += "bg-white border-slate-200 shadow-sm";

  return (
    <div className={cardStyle}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isPremiumQ ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-700'}`}>
            {question.author_name?.charAt(0)}
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-800 text-sm">{question.author_name}</span>
              {isMine && <span className="text-[10px] bg-indigo-500 text-white px-1.5 py-0.5 rounded">我</span>}
              {isPremiumQ && <span className="text-[10px] bg-gradient-to-r from-amber-400 to-orange-500 text-white px-1.5 py-0.5 rounded-full flex items-center"><Award className="w-3 h-3 mr-0.5"/>优质问题</span>}
            </div>
            <span className="text-xs text-slate-400">{new Date(question.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {isTeacher && !readonly && (
            <div className="flex space-x-1 mr-2 bg-slate-50 p-1 rounded-lg border border-slate-100">
              <button onClick={() => onStatusChange(question.id, 'unresolved')} className={`p-1 ${question.status==='unresolved'?'text-rose-500 bg-rose-100':'text-slate-400 hover:text-rose-500'} rounded`}><MessageCircleQuestion className="w-4 h-4" /></button>
              <button onClick={() => onStatusChange(question.id, 'resolved')} className={`p-1 ${question.status==='resolved'?'text-emerald-500 bg-emerald-100':'text-slate-400 hover:text-emerald-500'} rounded`}><CheckCircle2 className="w-4 h-4" /></button>
            </div>
          )}
          {!readonly && (
            <span className={`text-[11px] font-medium px-2 py-1 rounded-full border ${question.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {question.status === 'resolved' ? '已解决' : '待解决'}
            </span>
          )}
        </div>
      </div>
      
      <p className="text-slate-700 mb-4 whitespace-pre-wrap text-[15px] leading-relaxed">{question.text}</p>
      
      {!isTeacher && !readonly && (
        <div className="flex items-center space-x-3 mb-3 border-t border-slate-100 pt-3">
          {allowReactions && (
            <button onClick={toggleConfusion} className={`flex items-center text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors ${hasConfused ? 'text-amber-600 bg-amber-50' : 'text-slate-500 hover:bg-slate-100'}`}>
              <HelpCircle className={`w-4 h-4 mr-1 ${hasConfused ? 'fill-amber-200' : ''}`} /> 同问/有共鸣 {confusions.length > 0 && `(${confusions.length})`}
            </button>
          )}
          {allowReplies && (
            <button onClick={() => setIsReplying(!isReplying)} className="flex items-center text-xs font-medium text-slate-500 hover:bg-slate-100 px-2.5 py-1.5 rounded-md transition-colors">
              <MessageSquare className="w-4 h-4 mr-1" /> 回复探讨
            </button>
          )}
          {isMine && question.status === 'unresolved' && (
            <button onClick={() => onStatusChange(question.id, 'resolved')} className="flex items-center text-xs font-medium text-emerald-600 hover:bg-emerald-50 px-2.5 py-1.5 rounded-md transition-colors ml-auto border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 mr-1" /> 我已弄懂
            </button>
          )}
        </div>
      )}

      {isReplying && (
        <div className="mb-4 flex space-x-2">
          <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleSubmitReply()}
            placeholder="写下你的答案或想法..." 
            className="flex-1 px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
          <button onClick={handleSubmitReply} disabled={!replyText.trim()} className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">发送</button>
        </div>
      )}

      {question.replies && question.replies.length > 0 && (
        <div className="mt-2 bg-slate-50/80 rounded-xl p-3 space-y-3 border border-slate-100">
          {question.replies.map((reply) => {
            const likes = reply.likedBy || [];
            const hasLiked = likes.includes(currentUserId);
            const isPremiumReply = maxLikes > 0 && likes.length === maxLikes;
            
            return (
              <div key={reply.id} className={`text-sm flex items-start p-2 rounded-lg ${isPremiumReply ? 'bg-yellow-50 border border-yellow-100' : ''}`}>
                <CornerDownRight className={`w-4 h-4 mr-2 mt-0.5 shrink-0 ${isPremiumReply ? 'text-yellow-400' : 'text-slate-300'}`} />
                <div className="flex-1">
                  <div className="flex items-center mb-0.5">
                    <span className="font-medium text-slate-700">{reply.authorName}</span>
                    {isPremiumReply && <span className="ml-2 text-[10px] text-yellow-700 bg-yellow-200 px-1.5 py-0.5 rounded flex items-center"><Award className="w-3 h-3 mr-0.5"/>优质答案</span>}
                    <span className="text-slate-400 text-[10px] ml-auto">{new Date(reply.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-600">{reply.text}</p>
                  {(allowReactions || likes.length > 0) && (
                    <div className="mt-1 flex items-center">
                      {!isTeacher && !readonly ? (
                        <button onClick={() => toggleReplyLike(reply.id)} className={`flex items-center text-[11px] font-medium transition-colors ${hasLiked ? 'text-emerald-600' : 'text-slate-400 hover:text-emerald-500'}`}>
                          <ThumbsUp className={`w-3 h-3 mr-1 ${hasLiked ? 'fill-emerald-200' : ''}`} /> {likes.length > 0 ? likes.length : '有用'}
                        </button>
                      ) : (
                        likes.length > 0 && <span className="flex items-center text-[11px] text-emerald-600"><ThumbsUp className="w-3 h-3 mr-1 fill-emerald-200" /> {likes.length} 人觉得有用</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
