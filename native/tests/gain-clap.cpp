#include <clap/clap.h>
#include <clap/ext/audio-ports.h>
#include <clap/ext/params.h>
#include <cstring>
#include <clap/ext/state.h>
#include <clap/ext/gui.h>
#include <clap/ext/posix-fd-support.h>
#ifdef AURALIS_X11
#include <X11/Xlib.h>
#endif
static const char*features[]={CLAP_PLUGIN_FEATURE_AUDIO_EFFECT,CLAP_PLUGIN_FEATURE_STEREO,nullptr};
static const clap_plugin_descriptor_t descriptor={CLAP_VERSION,"studio.auralis.test-gain","Auralis test gain","Auralis","","","","1","Deterministic test fixture",features};
static double gain=.5,bias=0;static const clap_host_t*host=nullptr;
static const clap_plugin_state_t stateExt={[](const clap_plugin_t*,const clap_ostream_t*s){double v[2]={gain,bias};return s->write(s,v,sizeof(v))==sizeof(v);},[](const clap_plugin_t*,const clap_istream_t*s){double v[2];if(s->read(s,v,sizeof(v))!=sizeof(v))return false;gain=v[0];bias=v[1];return true;}};
#ifdef AURALIS_X11
static Display*display=nullptr;static Window child=0;static const clap_host_posix_fd_support_t*fdHost=nullptr;
static const clap_plugin_posix_fd_support_t fdExt={[](const clap_plugin_t*,int,clap_posix_fd_flags_t){while(XPending(display)){XEvent e;XNextEvent(display,&e);if(e.type==ButtonPress){gain=.75;bias=.01;XClearWindow(display,child);}if(e.type==Expose){GC gc=XCreateGC(display,child,0,nullptr);XSetForeground(display,gc,0xc7e4fa);const char*label=gain>.6?"Saved gain 0.75 + bias 0.01":"Click to set gain 0.75 + bias 0.01";XDrawString(display,child,gc,20,60,label,strlen(label));XFreeGC(display,gc);}}XFlush(display);}};
static const clap_plugin_gui_t gui={[](const clap_plugin_t*,const char*api,bool floating){return !floating&&!strcmp(api,CLAP_WINDOW_API_X11);},[](const clap_plugin_t*,const char**api,bool*f){*api=CLAP_WINDOW_API_X11;*f=false;return true;},[](const clap_plugin_t*,const char*,bool){display=XOpenDisplay(nullptr);return display!=nullptr;},[](const clap_plugin_t*){if(fdHost)fdHost->unregister_fd(host,ConnectionNumber(display));if(child)XDestroyWindow(display,child);XCloseDisplay(display);child=0;display=nullptr;},[](const clap_plugin_t*,double){return true;},[](const clap_plugin_t*,uint32_t*w,uint32_t*h){*w=400;*h=180;return true;},[](const clap_plugin_t*){return false;},[](const clap_plugin_t*,clap_gui_resize_hints_t*){return false;},[](const clap_plugin_t*,uint32_t*,uint32_t*){return true;},[](const clap_plugin_t*,uint32_t,uint32_t){return true;},[](const clap_plugin_t*,const clap_window_t*p){child=XCreateSimpleWindow(display,p->x11,0,0,400,180,0,0,0x304860);XSelectInput(display,child,ExposureMask|ButtonPressMask);fdHost=(const clap_host_posix_fd_support_t*)host->get_extension(host,CLAP_EXT_POSIX_FD_SUPPORT);return fdHost&&fdHost->register_fd(host,ConnectionNumber(display),CLAP_POSIX_FD_READ);},[](const clap_plugin_t*,const clap_window_t*){return false;},[](const clap_plugin_t*,const char*){},[](const clap_plugin_t*){XMapWindow(display,child);XFlush(display);return true;},[](const clap_plugin_t*){XUnmapWindow(display,child);return true;}};
#endif
static const clap_plugin_audio_ports_t ports={[](const clap_plugin_t*,bool){return 1u;},[](const clap_plugin_t*,uint32_t index,bool,clap_audio_port_info_t*info){if(index)return false;*info={};info->id=0;info->channel_count=2;info->flags=CLAP_AUDIO_PORT_IS_MAIN;info->port_type=CLAP_PORT_STEREO;info->in_place_pair=CLAP_INVALID_ID;return true;}};
static const clap_plugin_params_t params={[](const clap_plugin_t*){return 1u;},[](const clap_plugin_t*,uint32_t i,clap_param_info_t*p){if(i)return false;*p={};p->id=0;p->min_value=0;p->max_value=2;p->default_value=.5;strcpy(p->name,"Gain");return true;},[](const clap_plugin_t*,clap_id,double*v){*v=gain;return true;},nullptr,nullptr,[](const clap_plugin_t*,const clap_input_events_t*,const clap_output_events_t*){}};
static clap_plugin_t plugin={&descriptor,nullptr,[](const clap_plugin_t*){gain=.5;bias=0;return true;},[](const clap_plugin_t*){},[](const clap_plugin_t*,double,uint32_t,uint32_t){return true;},[](const clap_plugin_t*){},[](const clap_plugin_t*){return true;},[](const clap_plugin_t*){},[](const clap_plugin_t*){},[](const clap_plugin_t*,const clap_process_t*p)->clap_process_status{for(uint32_t e=0;e<p->in_events->size(p->in_events);e++){const auto*h=p->in_events->get(p->in_events,e);if(h->type==CLAP_EVENT_PARAM_VALUE)gain=((const clap_event_param_value_t*)h)->value;}for(uint32_t c=0;c<2;c++)for(uint32_t i=0;i<p->frames_count;i++)p->audio_outputs[0].data32[c][i]=(bias?p->audio_inputs[0].data32[c][i]*gain+bias:p->audio_inputs[0].data32[c][i]*gain);return CLAP_PROCESS_CONTINUE;},[](const clap_plugin_t*,const char*id)->const void*{if(!strcmp(id,CLAP_EXT_STATE))return &stateExt;
#ifdef AURALIS_X11
if(!strcmp(id,CLAP_EXT_GUI))return &gui;if(!strcmp(id,CLAP_EXT_POSIX_FD_SUPPORT))return &fdExt;
#endif
if(!strcmp(id,CLAP_EXT_AUDIO_PORTS))return &ports;if(!strcmp(id,CLAP_EXT_PARAMS))return &params;return nullptr;},[](const clap_plugin_t*){}};
static const clap_plugin_factory_t factory={[](const clap_plugin_factory_t*){return 1u;},[](const clap_plugin_factory_t*,uint32_t i){return i?nullptr:&descriptor;},[](const clap_plugin_factory_t*,const clap_host_t*h,const char*id)->const clap_plugin_t*{host=h;return strcmp(id,descriptor.id)?nullptr:&plugin;}};
extern "C" CLAP_EXPORT const clap_plugin_entry_t clap_entry={CLAP_VERSION,[](const char*){return true;},[](){},[](const char*id)->const void*{return strcmp(id,CLAP_PLUGIN_FACTORY_ID)?nullptr:&factory;}};
