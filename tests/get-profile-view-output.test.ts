import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Lexicons, type LexiconDoc } from '@atproto/lexicon';

// The fields sifa-api's getProfileView emits must be in the published view, so
// third-party clients can rely on them and the validator checks their types
// (unknown fields are accepted without any check).
const LEXICONS_DIR = join(import.meta.dirname, '..', 'lexicons', 'id', 'sifa');
const load = (file: string) =>
  JSON.parse(readFileSync(join(LEXICONS_DIR, file), 'utf-8')) as LexiconDoc;
const lexicons = new Lexicons([load('defs.json'), load('getProfileView.json')]);
const NSID = 'id.sifa.getProfileView';

const member = {
  did: 'did:plc:member',
  handle: 'did:plc:member',
  hasSifaProfile: true,
  claimed: false,
  confirmed: false,
  confirmedStale: false,
  role: 'Maintainer',
};

const delivery = {
  rkey: 'd1',
  eventName: 'AtmosphereConf',
  location: 'Vancouver, Canada',
  locationCountry: 'Canada',
  locationRegion: 'British Columbia',
  locationLocality: 'Vancouver',
  countryCode: 'CA',
  sameAs: 'at://did:plc:other/id.sifa.profile.presentationDelivery/d9',
  links: [],
  coSpeakers: [
    {
      did: 'did:plc:cospeaker',
      handle: 'cospeaker.example.com',
      hasSifaProfile: true,
      claimed: true,
      confirmed: true,
      confirmedStale: false,
    },
  ],
};

function view(): Record<string, unknown> {
  return {
    did: 'did:plc:tester',
    handle: 'tester.example.com',
    honorificPrefix: 'Dr.',
    honorificSuffix: 'PhD, OBE',
    namePronunciation: 'TES-ter',
    namePronunciationAudioUrl: 'https://pds.example.com/xrpc/com.atproto.sync.getBlob?did=x&cid=y',
    skills: [
      {
        rkey: 's1',
        name: 'TypeScript',
        subCategory: 'Languages',
        cid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm',
        endorsementCount: 3,
        endorsed: true,
        endorsedAs: ['JavaScript'],
      },
    ],
    projects: [
      {
        rkey: 'p1',
        name: 'Sifa',
        members: [member],
        sameAs: 'at://did:plc:other/id.sifa.profile.project/p9',
      },
    ],
    presentations: [
      {
        rkey: 't1',
        title: 'A talk',
        coverImageUrl: 'https://cdn.example.com/cover.jpg',
        deliveries: [delivery],
      },
    ],
    presentationDeliveries: [delivery],
    honors: [
      {
        rkey: 'h1',
        title: 'Best talk',
        kind: 'id.sifa.defs#honorAward',
        links: [{ url: 'https://example.com/results', kind: 'article', label: 'Results' }],
      },
    ],
  };
}

function withValue(path: (string | number)[], value: unknown): Record<string, unknown> {
  const root = view();
  let target: Record<string | number, unknown> = root;
  for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, unknown>;
  target[path[path.length - 1] as string | number] = value;
  return root;
}

describe('getProfileView output: fields sifa-api emits', () => {
  it('accepts a view with every emitted field', () => {
    expect(() => lexicons.assertValidXrpcOutput(NSID, view())).not.toThrow();
  });

  it.each([
    ['namePronunciation over 64 graphemes', ['namePronunciation'], 'a'.repeat(65)],
    ['namePronunciationAudioUrl not a URI', ['namePronunciationAudioUrl'], 'not a uri'],
    ['endorsementCount not an integer', ['skills', 0, 'endorsementCount'], 'three'],
    ['endorsed not a boolean', ['skills', 0, 'endorsed'], 'yes'],
    ['endorsedAs not a string array', ['skills', 0, 'endorsedAs'], [1]],
    ['skill cid not a CID', ['skills', 0, 'cid'], 'not-a-cid'],
    ['project members not an array', ['projects', 0, 'members'], 'x'],
    ['project member without a did', ['projects', 0, 'members', 0], { handle: 'x' }],
    ['project sameAs not an AT-URI', ['projects', 0, 'sameAs'], 'https://example.com'],
    ['coverImageUrl not a URI', ['presentations', 0, 'coverImageUrl'], 'nope'],
    ['delivery countryCode not a string', ['presentationDeliveries', 0, 'countryCode'], 3],
    [
      'co-speaker confirmed not a boolean',
      ['presentationDeliveries', 0, 'coSpeakers', 0, 'confirmed'],
      'no',
    ],
    ['honor links item without a url', ['honors', 0, 'links'], [{ label: 'x' }]],
    ['honor kind not a string', ['honors', 0, 'kind'], 1],
    ['honorificPrefix not a string', ['honorificPrefix'], 1],
    ['honorificSuffix over 128 graphemes', ['honorificSuffix'], 'a'.repeat(129)],
  ] as const)('rejects %s', (_name, path, value) => {
    expect(() => lexicons.assertValidXrpcOutput(NSID, withValue([...path], value))).toThrow();
  });
});
