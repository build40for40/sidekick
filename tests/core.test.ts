import { describe, expect, it } from 'vitest';
import { validateReply } from '../src/tutor/schema';
import { transitionLesson } from '../src/tutor/lesson';
import { TurnGate } from '../src/voice/turn';
import { mappedControl } from '../src/controller/gamepad';
import { developmentReply } from '../src/tutor/development';
describe('tutor action boundary',()=> {
  it('validates Fortnite move sequences',()=> {
    expect(validateReply({spoken:'Circle, then R2.',action:'sequence',sequenceId:'build-wall'}).sequenceId).toBe('build-wall');
    for(const raw of [{spoken:'x',action:'sequence'},{spoken:'x',action:'sequence',sequenceId:'fly'},{spoken:'x',action:'sequence',sequenceId:'jump',controlId:'cross'},{spoken:'x',action:'highlight',controlId:'cross',sequenceId:'jump'}]) expect(()=>validateReply(raw)).toThrow();
    expect(developmentReply('How do I build a wall?')).toMatchObject({action:'sequence',sequenceId:'build-wall'});
    expect(developmentReply('How do I aim and shoot?')).toMatchObject({action:'sequence',sequenceId:'aim-shoot'});
    expect(developmentReply('Where is R2?')).toMatchObject({controlId:'right-trigger'});
  });
  it('every sequence step names a real control',async()=> {
    const { sequences, byId } = await import('../src/controller/manifest');
    for(const s of sequences) for(const st of s.steps) expect(byId.has(st.control)).toBe(true);
  });
  it('accepts only known controls and actions',()=> {
    expect(validateReply({spoken:'Here is RB.',action:'highlight',controlId:'right-bumper'}).controlId).toBe('right-bumper');
    for(const raw of ['oops',{spoken:'x',action:'execute'},{spoken:'x',action:'press',controlId:'bad'},{spoken:'x',action:'press'},{spoken:'x',action:'none',code:'alert(1)'},{spoken:'x',action:'tilt',controlId:'cross'},{spoken:'x',action:'squeeze',controlId:'left-stick'},{spoken:'x',action:'none',exercise:'find'}]) expect(()=>validateReply(raw)).toThrow();
  });
  it('never accepts malformed output as speech',()=> {
    expect(()=>validateReply('{"spoken":"oops"')).toThrow();
    expect(()=>validateReply({spoken:'',action:'none'})).toThrow();
  });
  it('resolves development examples',()=> {
    expect(developmentReply('Where is the right bumper?').controlId).toBe('right-bumper');
    expect(developmentReply('What does clicking the stick mean?').action).toBe('press');
    expect(developmentReply('Where is the banana?').action).toBe('none');
  });
});
describe('lesson completion belongs to the app',()=> {
  it('rejects wrong input and distinguishes virtual from physical',()=> {
    const initial=transitionLesson(null,{type:'start',kind:'find',target:'cross'});
    expect(transitionLesson(initial,{type:'input',controlId:'circle',source:'physical'})).toBe(initial);
    expect(transitionLesson(initial,{type:'input',controlId:'cross',source:'virtual'})).toMatchObject({complete:true,source:'virtual'});
    expect(transitionLesson(initial,{type:'input',controlId:'cross',source:'physical'})).toMatchObject({complete:true,source:'physical'});
  });
  it('can remove hints and start a new exercise',()=> {
    let state=transitionLesson(null,{type:'start',kind:'practise',target:'right-bumper'});
    state=transitionLesson(state,{type:'hints',enabled:false}); expect(state?.hints).toBe(false);
    state=transitionLesson(state,{type:'start',kind:'click',target:'left-stick'}); expect(state).toMatchObject({hints:true,complete:false,target:'left-stick'});
  });
});
describe('input and turn identity',()=> {
  it('invalidates previous turns',()=> {const gate=new TurnGate();const old=gate.next();expect(gate.current(old)).toBe(true);gate.invalidate();expect(gate.current(old)).toBe(false);expect(gate.current(gate.next())).toBe(true);});
  it('fails closed for unknown physical mappings',()=> {expect(mappedControl('',0)).toBeUndefined();expect(mappedControl('vendor',4)).toBeUndefined();expect(mappedControl('standard',99)).toBeUndefined();expect(mappedControl('standard',5)).toBe('right-bumper');});
});

import { transitionPhase } from '../src/voice/machine';
it('permits turn-taking stages and rejects recording while speaking',()=> {
  expect(transitionPhase('listening','transcribing')).toBe('transcribing');
  expect(transitionPhase('transcribing','thinking')).toBe('thinking');
  expect(()=>transitionPhase('speaking','listening')).toThrow();
  expect(transitionPhase('speaking','ready')).toBe('ready');
});
