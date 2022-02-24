package cluster

import (
	"context"
	"strconv"
	"time"

	"github.com/apex/log"
	"github.com/envkey/envkey/public/sdks/envkey-kubernetes-watcher/kube"
	"github.com/envkey/envkey/public/sdks/envkey-source/daemon"
	apps "k8s.io/api/apps/v1"
	core "k8s.io/api/core/v1"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

const reloadAnnotationKey = "watcher.envkey.com/reloaded"

var listeningEnvkeys = map[string]bool{}

func WatchEnvkeys() error {
	clearAllEnvkeyWatchers()

	err := daemon.LaunchDetachedIfNeeded(daemon.DaemonOptions{})
	if err != nil {
		log.WithError(err).Error("Error launching envkey-source daemon")
		return err
	}

	allEnvkeys := []string{}
	addedEnvkey := map[string]bool{}

	for envkey := range DeploymentsByEnvkey {
		if !addedEnvkey[envkey] {
			allEnvkeys = append(allEnvkeys, envkey)
			addedEnvkey[envkey] = true
		}
	}

	for envkey := range DaemonSetsByEnvkey {
		if !addedEnvkey[envkey] {
			allEnvkeys = append(allEnvkeys, envkey)
			addedEnvkey[envkey] = true
		}
	}

	for envkey := range StatefulSetsByEnvkey {
		if !addedEnvkey[envkey] {
			allEnvkeys = append(allEnvkeys, envkey)
			addedEnvkey[envkey] = true
		}
	}

	for _, envkey := range allEnvkeys {
		deployments := DeploymentsByEnvkey[envkey]
		daemonSets := DaemonSetsByEnvkey[envkey]
		statefulSets := StatefulSetsByEnvkey[envkey]

		listenChange(envkey, func() {

			timestamp := strconv.FormatInt(time.Now().UTC().UnixNano(), 10)

			// trigger rolling restart of all deployments, daemonSets, and statefulSets using this ENVKEY
			for _, deployment := range deployments {
				go func(deployment apps.Deployment) {
					setAnnotation(&deployment.Spec.Template, timestamp)
					_, err = kube.Client.AppsV1().Deployments(deployment.Namespace).Update(context.TODO(), &deployment, v1.UpdateOptions{})
					if err != nil {
						log.WithError(err).Errorf("Error reloading deployment %s", deployment.Name)
					}
				}(deployment)
			}

			for _, daemonSet := range daemonSets {
				go func(daemonSet apps.DaemonSet) {
					setAnnotation(&daemonSet.Spec.Template, timestamp)
					_, err = kube.Client.AppsV1().DaemonSets(daemonSet.Namespace).Update(context.TODO(), &daemonSet, v1.UpdateOptions{})
					if err != nil {
						log.WithError(err).Errorf("Error reloading daemonSet %s", daemonSet.Name)
					}
				}(daemonSet)
			}

			for _, statefulSet := range statefulSets {
				go func(statefulSet apps.StatefulSet) {
					setAnnotation(&statefulSet.Spec.Template, timestamp)
					_, err = kube.Client.AppsV1().StatefulSets(statefulSet.Namespace).Update(context.TODO(), &statefulSet, v1.UpdateOptions{})
					if err != nil {
						log.WithError(err).Errorf("Error reloading statefulSet %s", statefulSet.Name)
					}
				}(statefulSet)
			}
		})
	}

	return nil
}

func listenChange(envkey string, onChange func()) {
	daemon.ListenChange(envkey, onChange, func() {
		clearEnvkeyWatcher(envkey)
	}, func(err error) {
		clearEnvkeyWatcher(envkey)
	}, func(err error) {
		clearEnvkeyWatcher(envkey)
	})
}

func clearEnvkeyWatcher(envkey string) {
	daemon.RemoveListener(envkey)
	delete(listeningEnvkeys, envkey)
}

func clearAllEnvkeyWatchers() {
	for envkey := range listeningEnvkeys {
		clearEnvkeyWatcher(envkey)
	}
}

func setAnnotation(spec *core.PodTemplateSpec, ts string) {
	if spec.ObjectMeta.Annotations == nil {
		spec.ObjectMeta.Annotations = make(map[string]string)
	}
	spec.ObjectMeta.Annotations[reloadAnnotationKey] = ts
}
