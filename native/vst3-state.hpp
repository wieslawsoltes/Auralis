#pragma once
#include "vst3-types.hpp"
#include "state.hpp"
#include "x11-window.hpp"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/gui/iplugview.h"
namespace Steinberg{DEF_CLASS_IID(IBStream) DEF_CLASS_IID(Vst::IEditController) DEF_CLASS_IID(Vst::IComponentHandler) DEF_CLASS_IID(Vst::IConnectionPoint) DEF_CLASS_IID(IPlugView) DEF_CLASS_IID(IPlugFrame) DEF_CLASS_IID(Linux::IRunLoop)}
struct MemoryStream:IBStream{std::vector<unsigned char>bytes;int64 at=0;STATIC_UNKNOWN(IBStream)
 tresult PLUGIN_API read(void*b,int32 n,int32*out)override{if(n<0||!b)return kInvalidArgument;int32 count=std::min<int64>(n,std::max<int64>(0,int64(bytes.size())-at));if(count)memcpy(b,bytes.data()+at,count);at+=count;if(out)*out=count;return count==n?kResultOk:kResultFalse;}
 tresult PLUGIN_API write(void*b,int32 n,int32*out)override{if(n<0||at+n>int64(MAX_STATE)||!b)return kInvalidArgument;if(at+n>int64(bytes.size()))bytes.resize(at+n);memcpy(bytes.data()+at,b,n);at+=n;if(out)*out=n;return kResultOk;}
 tresult PLUGIN_API seek(int64 offset,int32 mode,int64*out)override{int64 p=offset+(mode==kIBSeekCur?at:mode==kIBSeekEnd?int64(bytes.size()):0);if(mode<0||mode>2||p<0||p>int64(MAX_STATE))return kInvalidArgument;at=p;if(out)*out=at;return kResultOk;}
 tresult PLUGIN_API tell(int64*out)override{if(!out)return kInvalidArgument;*out=at;return kResultOk;}};
struct ComponentHandler:IComponentHandler{Parameters*pending=nullptr;bool restart=false;STATIC_UNKNOWN(IComponentHandler)tresult PLUGIN_API beginEdit(ParamID)override{return kResultOk;}tresult PLUGIN_API endEdit(ParamID)override{return kResultOk;}tresult PLUGIN_API performEdit(ParamID id,ParamValue value)override{if(!pending||!std::isfinite(value)||value<0||value>1)return kInvalidArgument;for(auto&q:pending->data)if(q.id==id){q.value=value;return kResultOk;}if(pending->data.size()>=1024)return kResultFalse;ParamQueue q;q.id=id;q.value=value;pending->data.push_back(q);return kResultOk;}tresult PLUGIN_API restartComponent(int32 flags)override{if(flags&(kIoChanged|kReloadComponent))restart=true;return kResultOk;}};
inline void loadVst(IComponent*c,IEditController*controller,const NativeState&s){if(!s.component.empty()){MemoryStream stream;stream.bytes=s.component;require(c->setState(&stream)==kResultOk,"Component rejected saved state");if(controller){stream.at=0;controller->setComponentState(&stream);}}else if(controller){MemoryStream stream;if(c->getState(&stream)==kResultOk){stream.at=0;controller->setComponentState(&stream);}}if(controller&&!s.controller.empty()){MemoryStream stream;stream.bytes=s.controller;require(controller->setState(&stream)==kResultOk,"Controller rejected saved state");}}
inline void saveVst(IComponent*c,IEditController*controller,NativeState&s,const std::string&path){MemoryStream stream;require(c->getState(&stream)==kResultOk,"Component state is unavailable");s.component=std::move(stream.bytes);s.controller.clear();if(controller){MemoryStream state;if(controller->getState(&state)==kResultOk)s.controller=std::move(state.bytes);}writeState(path,s);}
#ifdef AURALIS_X11
#include "pluginterfaces/base/keycodes.h"
#include <X11/keysym.h>
inline int16 vstKey(KeySym s){switch(s){case XK_BackSpace:return KEY_BACK;case XK_Tab:return KEY_TAB;case XK_Return:return KEY_RETURN;case XK_KP_Enter:return KEY_ENTER;case XK_Escape:return KEY_ESCAPE;case XK_Delete:return KEY_DELETE;case XK_Insert:return KEY_INSERT;case XK_Home:return KEY_HOME;case XK_End:return KEY_END;case XK_Left:return KEY_LEFT;case XK_Right:return KEY_RIGHT;case XK_Up:return KEY_UP;case XK_Down:return KEY_DOWN;case XK_Page_Up:return KEY_PAGEUP;case XK_Page_Down:return KEY_PAGEDOWN;case XK_space:return KEY_SPACE;default:return s>=XK_F1&&s<=XK_F12?KEY_F1+s-XK_F1:0;}}
struct PlugFrame:IPlugFrame,Linux::IRunLoop{NativeWindow*window;IPlugView*view;uint32 refs=1;struct Timer{uint64 next,period;};std::map<Linux::ITimerHandler*,Timer>timers;std::map<Linux::IEventHandler*,int>fds;PlugFrame(NativeWindow*w,IPlugView*v):window(w),view(v){}~PlugFrame(){for(auto&[h,t]:timers)h->release();for(auto&[h,fd]:fds)h->release();}
 tresult PLUGIN_API queryInterface(const TUID id,void**out)override{if(FUnknownPrivate::iidEqual(id,IPlugFrame::iid)||FUnknownPrivate::iidEqual(id,FUnknown::iid))*out=static_cast<IPlugFrame*>(this);else if(FUnknownPrivate::iidEqual(id,Linux::IRunLoop::iid))*out=static_cast<Linux::IRunLoop*>(this);else{*out=nullptr;return kNoInterface;}addRef();return kResultOk;}uint32 PLUGIN_API addRef()override{return ++refs;}uint32 PLUGIN_API release()override{return --refs;}
 tresult PLUGIN_API resizeView(IPlugView*v,ViewRect*r)override{if(!window||!r||v!=view||r->getWidth()<16||r->getHeight()<16||r->getWidth()>8192||r->getHeight()>8192)return kInvalidArgument;window->resize(r->getWidth(),r->getHeight());return view->onSize(r);}
 tresult PLUGIN_API registerEventHandler(Linux::IEventHandler*h,Linux::FileDescriptor fd)override{if(!h||fd<0||fds.count(h)||fds.size()>=128)return kInvalidArgument;h->addRef();fds[h]=fd;return kResultOk;}
 tresult PLUGIN_API unregisterEventHandler(Linux::IEventHandler*h)override{if(!fds.erase(h))return kResultFalse;h->release();return kResultOk;}
 tresult PLUGIN_API registerTimer(Linux::ITimerHandler*h,Linux::TimerInterval ms)override{if(!h||timers.count(h)||timers.size()>=128)return kInvalidArgument;h->addRef();timers[h]={monotonicMs()+std::max<uint64_t>(1,ms),std::max<uint64_t>(1,ms)};return kResultOk;}
 tresult PLUGIN_API unregisterTimer(Linux::ITimerHandler*h)override{if(!timers.erase(h))return kResultFalse;h->release();return kResultOk;}
 void pump(){std::vector<Linux::ITimerHandler*>due;auto now=monotonicMs();for(auto&[h,t]:timers)if(now>=t.next){t.next=now+t.period;h->addRef();due.push_back(h);}for(auto*h:due){if(timers.count(h))h->onTimer();h->release();}std::vector<std::pair<Linux::IEventHandler*,int>>snapshot(fds.begin(),fds.end());for(auto&[h,fd]:snapshot)h->addRef();for(auto&[h,fd]:snapshot){pollfd p{fd,POLLIN,0};if(fds.count(h)&&poll(&p,1,0)>0&&(p.revents&(POLLIN|POLLHUP|POLLERR)))h->onFDIsSet(fd);h->release();}}
};
#endif
