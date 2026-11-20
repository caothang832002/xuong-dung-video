// Điểm vào cho bộ xuất video của Remotion (máy chủ gọi khi bấm "Xuất video").
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { durationInFrames, emptyProject, normalizeProject } from '../model';
import { MainVideo, type VideoProps } from './MainVideo';

const Root: React.FC = () => (
  <Composition
    id="Video"
    component={MainVideo as React.FC<any>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={{ project: emptyProject() } as VideoProps}
    calculateMetadata={({ props }) => {
      const project = normalizeProject((props as VideoProps).project);
      return {
        width: project.width,
        height: project.height,
        fps: project.fps,
        durationInFrames: durationInFrames(project),
        props: { ...props, project },
      };
    }}
  />
);

registerRoot(Root);
