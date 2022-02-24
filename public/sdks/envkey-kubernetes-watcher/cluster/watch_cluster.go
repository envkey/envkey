package cluster

import (
	"context"

	"github.com/apex/log"
	"github.com/envkey/envkey/public/sdks/envkey-kubernetes-watcher/kube"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// re-sync cluster state when relevant resources are updated
func WatchCluster(namespaces []string) error {

	for _, namespace := range namespaces {
		deploymentsWatcher, err := kube.Client.AppsV1().Deployments(namespace).Watch(context.TODO(), v1.ListOptions{LabelSelector: "!watcher.envkey.com/ignore"})

		if err != nil {
			log.WithError(err).Errorf("Error watching deployments in namespace %s", namespace)
			return err
		}

		log.Infof("Watching for changes to Deployments in namespace %s...", namespace)
		go func(namespace string) {
			for range deploymentsWatcher.ResultChan() {
				log.Infof("Deployments were updated in namespace %s -- re-syncing cluster state and re-attaching ENVKEY listeners", namespace)
				Sync(namespaces)
			}
		}(namespace)

		daemonSetsWatcher, err := kube.Client.AppsV1().DaemonSets(namespace).Watch(context.TODO(), v1.ListOptions{LabelSelector: "!watcher.envkey.com/ignore"})

		if err != nil {
			log.WithError(err).Errorf("Error watching daemonSets in namespace %s", namespace)
			return err
		}

		log.Infof("Watching for changes to DaemonSets in namespace %s...", namespace)
		go func(namespace string) {
			for range daemonSetsWatcher.ResultChan() {
				log.Infof("DaemonSets were updated in namespace %s -- re-syncing cluster state and re-attaching ENVKEY listeners", namespace)
				Sync(namespaces)
			}
		}(namespace)

		statefulSetsWatcher, err := kube.Client.AppsV1().StatefulSets(namespace).Watch(context.TODO(), v1.ListOptions{LabelSelector: "!watcher.envkey.com/ignore"})

		if err != nil {
			log.WithError(err).Errorf("Error watching statefulSets in namespace %s", namespace)
			return err
		}

		log.Infof("Watching for changes to StatefulSets in namespace %s...", namespace)
		go func(namespace string) {
			for range statefulSetsWatcher.ResultChan() {
				log.Infof("StatefulSets were updated in namespace %s -- re-syncing cluster state and re-attaching ENVKEY listeners", namespace)
				Sync(namespaces)
			}
		}(namespace)

	}

	return nil

}
