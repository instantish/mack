import * as md from '../markdown';
import {
  DividerBlock,
  HeaderBlock,
  ImageBlock,
  KnownBlock,
  SectionBlock,
} from '@slack/types';

function parsePlainText(element: md.PhrasingContent): string[] {
  switch (element.type) {
    case 'linkReference':
    case 'link':
    case 'emphasis':
    case 'strong':
    case 'delete':
      return element.children.flatMap(parsePlainText);

    case 'break':
    case 'imageReference':
      return [];

    case 'image':
      return [element.title ?? element.url];

    case 'inlineCode':
    case 'text':
    case 'html':
      return [element.value];
  }
}

function isSectionBlock(block: KnownBlock): block is SectionBlock {
  return block.type === 'section';
}

function parseMrkdwn(element: Exclude<md.PhrasingContent, md.Image>): string {
  switch (element.type) {
    case 'link': {
      return `<${element.url}|${element.children
        .flatMap(parseMrkdwn)
        .join('')}> `;
    }

    case 'emphasis': {
      return `_${element.children.flatMap(parseMrkdwn).join('')}_`;
    }

    case 'inlineCode':
      return `\`${element.value}\``;

    case 'strong': {
      return `*${element.children.flatMap(parseMrkdwn).join('')}*`;
    }

    case 'text':
      return element.value;

    case 'delete': {
      return `~${element.children.flatMap(parseMrkdwn).join('')}~`;
    }

    default:
      return '';
  }
}

function addMrkdwn(
  content: string,
  accumulator: (SectionBlock | ImageBlock)[],
  prefix: string
) {
  const last = accumulator[accumulator.length - 1];

  if (last && isSectionBlock(last) && last.text) {
    last.text.text += content;
  } else {
    accumulator.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${prefix}${content}`,
      },
    });
  }
}

function parsePhrasingContent(
  element: md.PhrasingContent,
  accumulator: (SectionBlock | ImageBlock)[],
  prefix = ''
) {
  if (element.type === 'image') {
    const image: ImageBlock = {
      type: 'image',
      image_url: element.url,
      title: element.title
        ? {
            type: 'plain_text',
            text: element.title,
          }
        : undefined,
      alt_text: element.title ?? element.url,
    };

    accumulator.push(image);
  } else {
    const text = parseMrkdwn(element);
    addMrkdwn(text, accumulator, prefix);
  }
}

function parseParagraph(element: md.Paragraph, prefix = ''): KnownBlock[] {
  return element.children.reduce((accumulator, child) => {
    parsePhrasingContent(child, accumulator, prefix);
    return accumulator;
  }, [] as (SectionBlock | ImageBlock)[]);
}

function parseHeading(element: md.Heading): HeaderBlock {
  return {
    type: 'header',
    text: {
      type: 'plain_text',
      text: element.children.flatMap(parsePlainText).join(''),
    },
  };
}

function parseCode(element: md.Code): SectionBlock {
  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `\`\`\`${element.lang}\n${element.value}\n\`\`\``,
    },
  };
}

function parseList(element: md.List): SectionBlock {
  let index = 0;
  const contents = element.children.flatMap(item => {
    const paragraph = item.children[0];
    if (paragraph.type !== 'paragraph') {
      return '';
    }

    const text = paragraph.children
      .filter(
        (child): child is Exclude<md.PhrasingContent, md.Image> =>
          child.type !== 'image'
      )
      .flatMap(parseMrkdwn);

    if (element.start !== null && element.start !== undefined) {
      index += 1;
      return `${index}. ${text}`;
    } else if (item.checked !== null && item.checked !== undefined) {
      return `${
        item.checked
          ? ':ballot_box_with_check:'
          : ':negative_squared_cross_mark:'
      } ${text}`;
    } else {
      return `• ${text}`;
    }
  });

  return {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: contents.join('\n'),
    },
  };
}

function parseBlockquote(node: md.Blockquote): KnownBlock[] {
  return node.children
    .filter((child): child is md.Paragraph => child.type === 'paragraph')
    .flatMap(p => parseParagraph(p, '> '));
}

function parseThematicBreak(): DividerBlock {
  return {
    type: 'divider',
  };
}

function parseNode(node: md.FlowContent): KnownBlock[] {
  switch (node.type) {
    case 'heading':
      return [parseHeading(node)];

    case 'paragraph':
      return parseParagraph(node);

    case 'code':
      return [parseCode(node)];

    case 'blockquote':
      return parseBlockquote(node);

    case 'list':
      return [parseList(node)];

    case 'thematicBreak':
      return [parseThematicBreak()];

    default:
      return [];
  }
}

export function parseBlocks(root: md.Root): KnownBlock[] {
  return root.children.flatMap(parseNode);
}
